let password = require('process').env.MAFIAPASSWORD;

const WebSocket = require('ws');
const axios = require('axios').default;
axios.defaults.withCredentials = true

let roomid = '4517068c-be59-4551-9a62-a278508d94e5';
let userid, hostBannedUsernames, cookie;

function debug(msg) {
    console.log(msg);
}

axios.post('https://mafia.gg/api/user-session', {
    login: 'hellfate',
    password: password
}).then(res=>{
    userid = res.data.id;
    hostBannedUsernames = res.data.hostBannedUsernames;
    [cookie] = res.headers['set-cookie'];
    axios.defaults.headers.Cookie = cookie;
    return axios.get(`https://mafia.gg/api/rooms/${roomid}`);
}).then(res=>{
    let {engineUrl, auth} = res.data;
    let ws = new WebSocket(engineUrl, {'origin': 'https://mafia.gg'});
    let setup;
    let events = [];
    const onopen = ()=>{
        debug('Opened connection.');
        sendme = {type: 'clientHandshake', userId: userid, roomId: roomid, auth: auth};
        debug(sendme);
        ws.send(JSON.stringify(sendme));
    }
    const onclose = ()=>{
        debug('Closed connection.');
        console.log('disconnected hardkore');
    }
    const onmessage = back=>{
        let data = JSON.parse(back);
        events.push(data);
        if (data.type=='clientHandshake') {
            debug('Got reply to handshake.')
            //console.log(data);
            events = data.events;
            if (setup)
                ws.send(JSON.stringify(setup));
            else
                for (let i = 0; i < events.length; i++)
                    if (events[i].type=='options')
                        setup = data.events[i];
        }
        if (data.type=='chat' && data.from.model=='user' && data.from.userId != userid && data.message[0]=='!') {
            [func, ...args] = data.message.split(' ');
            debug('Detected command.');
            switch(func) {
                case '!say':
                    ws.send(JSON.stringify({type: 'chat', message: args.join(' ')}));
                    break;
                case '!deck':
                    let name = args.join(' ');
                    axios.get(`https://mafia.gg/api/decks?filter=${encodeURI(name)}`).then(res=>{
                        let bestmatchingdeck = res.data.decks[0];
                        setup.deck = bestmatchingdeck.key;
                        console.log(setup);
                        ws.send(JSON.stringify(setup));
                        ws.send(JSON.stringify({'type': 'chat', 'message': `Changed deck to ${bestmatchingdeck.name} deck.`}));
                    });
                    break;
                case '!setup':
                    let newsetup = args.join(' ');
                    let objs = newsetup.split('b').map(x=>x.split('a')).map(([x,y])=>{return {[x]: y}});
                    setup.roles = Object.assign({}, ...objs);
                    ws.send(JSON.stringify(setup));
                    ws.send(JSON.stringify({'type': 'chat', 'message': `Changed setup.`}));
                    break;
                case '!option':
                    let [key, ...value] = args[0];
                    value = value.join(' ');
                    if (key!='type')
                        setup[key] = value;
                    break;
                case '!start':
                    ws.send(JSON.stringify({'type': 'chat', 'message': `Starting the game...`}));
                    ws.send(JSON.stringify({'type': 'startGame'}));
                    break;
                case '!new':
                    let canmakenew = false;
                    for (let i = 0; i < events.length; i++)
                        if (events[i].type=='endGame')
                            canmakenew = true;
                    if (canmakenew) {
                        ws.send(JSON.stringify({'type': 'chat', 'message': 'Creating new room...'}));
                        axios.post('https://mafia.gg/api/rooms/', {
                            name: setup.roomName,
                            unlisted: setup.unlisted
                        }).then(res=>{
                            roomid = res.data.id;
                            ws.send(JSON.stringify({type: 'chat', message: `NOTE: I have gone to https://mafia.gg/game/${roomid}.`}));
                            ws.send(JSON.stringify({type: 'newGame', roomId: roomid}))
                            axios.get(`https://mafia.gg/api/rooms/${roomid}`).then(resp=>{
                                console.log(resp.data);
                                engineUrl = resp.data.engineUrl;
                                auth = resp.data.auth;
                                events = [];
                                ws.close();
                                console.log(engineUrl, auth, events);
                                ws = new WebSocket(engineUrl, {'origin': 'https://mafia.gg'});
                                ws.on('open', onopen);
                                debug('Attached onopen');
                                ws.on('message', onmessage);
                                debug('Attached onmessage');
                                debug(onmessage);
                                ws.on('close', onclose);
                                debug('Attached onclose');
                            });
                        }).catch(console.error);
                    }
                    break;
                /*case '!setupcode':
                    let newsetup = args.join(' ');
                    let objs = newsetup.split('b').map(x=>x.split('a')).map(([x,y])=>{return {[x]: y}});
                    break;*/
                case '!becomespec':
                    ws.send('{"type":"presence","isPlayer":false}');
                    break;
                case '!becomeplayer':
                    ws.send('{"type":"presence","isPlayer":true}');
                    break;
                case '!afk':
                    ws.send('{"type":"forceSpectate"}');
                    break;
                default:
                    ws.send(JSON.stringify({'type': 'chat', 'message': `${func.slice(1)}? What?`}));
            }
        }
    }
    ws.on('open', onopen);
    ws.on('message', onmessage);
    ws.on('close', onclose);
}).catch(console.error);