const {Client, RichEmbed} = require('discord.js');
const fs = require('fs');
const ytdl = require('ytdl-core');
const ytsearch = require('youtube-search');
var WebSocket = require('ws');
var ws = new WebSocket('wss://pubsub-edge.twitch.tv');
const bot = new Client();
//const token = ''; // dev
const token = ''; // rel
// var szkepGuild = ''; // dev
var szkepGuild = ''; // rel
var LIVE_BROADCAST_CHANNEL = '';
var commands = require('./commands.json');
var SzkepyTopic = 'video-playback.Szkepy';
var Guilds = {};
var aliaslist = {};
var VoiceConnection, dispatcher, streamVolume;

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
  });

var Giveaway = {
    'started': false,
    'startedBy': '',
    'startedDate': '',
    'startedAt': '',
    'privileged': ['180977752357208064','390579814719029261'],
    'channel': null,
    'message': null,
    'code': '',
    'end': 0,
    'winner': ''
};

ws.on('open', WSConnect);
ws.on('message', WSMessage);

bot.login(token);

bot.on('ready', botReady);
bot.on('message', botMessage);
bot.on('error', botError);
bot.on('guildMemberAdd', welcomeMember);

/*
 * functions *
 *
*/

function welcomeMember(member) {
    member.send({"embed":{
        "title": "Üdvözöllek a DC szerveren!",
        "description": "Kérlek válaszolj annyit, hogy fiú, vagy lány a nemednek megfelelően. Ez alapján kapsz Szkepper / Szkepina rangot.",
        "color": 16755200
    }});
}

function ParseAliases() {
    Object.keys(commands).forEach(x => {
        if(commands[x].hasOwnProperty('alias')) {
            commands[x].alias.forEach(y => {
                aliaslist[y] = x;
            });
        }
    });
}

function ParamLengthError(msg) {
    msg.channel.send({"embed":{"color":16711680,"title":"Ehhez a parancshoz több paraméter szükséges."}});
}

function reply(msg, title, text, color) {
    msg.channel.send(new RichEmbed().setTitle(title).setDescription(text).setColor(color||0x00FF00));
}

function BotInDifferentVoiceChannel(msg) {
	if(!msg.member.voiceChannel) return true;
	if(!bot.member.voiceChannel) return false;
	if(msg.member.voiceChannel.id != bot.member.voiceChannel.id) return true;
	return false;
}
function MemberVoiceChannelError(msg) {
	return reply(msg, "Nem ugyan abban a hangszobában vagy, mint a bot!", "", 0xFF0000);
}

function SzkepGuild() {
    return bot.guilds.find(x=>x.id == szkepGuild);
}

function SzkepRankAlert(member) {
    member.send({"embed":{"color":16711680,"title":"Neked már van Szkepper vagy Szkepina rangod!"}});
}

function WSPing() {
	ws.send('{"type":"PING"}');
}


function StreamStarted() {
	SzkepGuild().channels.find(x=>x.id==LIVE_BROADCAST_CHANNEL).send({
	  "embed": {
		"title": "Szkep streamelni kezdett a Twitchen!",
		"description": "Gyere, és nézd Te is: kattints a fenti szövegre!",
		"url": "https://twitch.tv/Szkepy",
		"color": 65280
	  }
	});
}

/* 
 * Event listeners *
 *
*/

function WSConnect() {	
	ws.send('{"type":"PING"}');
	ws.send('{"type":"LISTEN","data":{"topics":["'+SzkepyTopic+'"],"auth_token":""}}');
	setInterval(WSPing,270E3);
}

function WSMessage(msg, f) {
	msg = JSON.parse(msg);
	if(msg.type == 'MESSAGE' && msg.data.topic == SzkepyTopic) {
		msg = JSON.parse(msg.data.message);
		if(msg.type == 'stream-up') StreamStarted();
	}
}

function botReady() {
    console.clear();
    console.log('Initializing guilds');
    c = gs = 0;
    bot.guilds.map(g => { Guilds[g.id] = []; g.members.map(m => { Guilds[g.id].push(m.id); c++; }); gs++; });
    ParseAliases();
    bot.member = SzkepGuild().members.find(x=>x.id==bot.user.id);
    console.log('Serving '+c+' members in '+gs+' guild(s)');
	
}

function botMessage(msg) {
    if(msg.author.bot) return;
	let ch = msg.channel.name?'#'+msg.channel.name:'PM';
	console.log('@'+msg.author.username+' '+ch+': '+msg.content);
    if(!msg.guild) IncomingPM(msg);
    else IncomingMSG(msg);
}

function CommandHandler(msg) {
    var sender = msg.author,
        params = msg.content.split(' '),
        command = params.shift().slice(1).toLowerCase();
    if(aliaslist.hasOwnProperty(command)) command = aliaslist[command];
    CMDFunctions(command, msg, params);
    if(!commands.hasOwnProperty(command)) return;
    if(commands[command].hasOwnProperty("return") && commands[command].return.length > 0) msg.channel.send(commands[command].return);
    if(commands[command].hasOwnProperty("reply") && commands[command].reply.length > 0) reply(msg,commands[command].description,commands[command].reply);
}

function CMDList() {
    var output = [];
    Object.keys(commands).forEach(function(x){
        let cmd = commands[x];
        let aliases = cmd.alias || [];
        if(aliases.length > 0) aliases = ' ('+aliases.join(', ')+')';
        else aliases = "";
        output.push('**'+x+'**'+aliases);
    });
    return output;
}

function CMDFunctions(command, msg, params) {
    var parser = {
        'help': ()=>{
            let op = CMDList();
			if(params.length == 1) HelpCmd(msg, params);
            else reply(msg, 'Parancsok listája', op.join(', '));
        },
        'kor': () => {
            let yr = Math.floor(((Date.now() - new Date("")) / (31557600000)));
            reply(msg, 'Szkep életkora', 'Szkep '+yr+' éves');
        },
        'come': () => { VoiceEnterChannel(msg); },
        'leave': () => { VoiceLeaveChannel(msg); },
        'play': () => { VoicePlay(msg, params); },
        'stop': () => { VoiceStop(msg); },
        'volume': () => { VoiceVolume(msg, params); },
		'clear': () => { ClearChat(msg, params); },
        'rookie': () => { Rookie(); }
    };
    if(parser.hasOwnProperty(command)) parser[command]();
}

function GiveawayCmd(msg, member) {
    if(Giveaway.privileged.indexOf(msg.author.id) == -1) return;
    var text = msg.content;
    var params = text.match(/([^ ]+)/g);
    params.shift();
    var members = Giveaway.members;
    
    if(params.length == 0) return member.send({"embed":{"title":"Giveaway parancsok","description":"!giveaway status\n!giveaway start <kód> <sorsolásig hátralévő percek> <#szoba>\n!giveaway cancel"}});

    switch(params.shift()) {
        case 'status': case 'info':
            var end = Giveaway.end - Date.now()/1E3;
            member.send({
                "embed": {
                    "title": "Giveaway információk",
                    "fields": [
                        {
                            "name": "❓El van indítva?",
                            "value": Giveaway.started?"- "+Giveaway.startedBy+" által **"+Giveaway.startedDate+"** napon **"+Giveaway.startedAt+"**-kor":"Nincs"
                        },
                        {
                            "name": "❓Kód:",
                            "value": "- "+Giveaway.code
                        },
                        {
                            "name": "❓Szoba neve:",
                            "value": "- #"+Giveaway.channel
                        },
                        {
                            "name": "❓Hátralévő idő:",
                            "value": "- "+end>=0?end+" másodperc":"letelt"
                        },
                        {
                            "name": "❓Utolsó nyertes:",
                            "value": "- "+Giveaway.winner
                        }
                    ]
                }
            })
        break;
        case 'start':
            if(Giveaway.started) return member.send({"embed":{"title":"Hiba","description":"Már el van indítva. Leállításhoz: !giveaway cancel"}});
            if(params.length < 3) return member.send({"embed":{"title":"Hiba","description":"Szükséges paraméterek:\n- kód\n- sorsolásig hátralévő percek\n- szoba neve"}});
            var ch = SzkepGuild().channels.find(x=>x.name==params[2]);
            if(!ch) return member.send("Nem létezik ez a szoba.");
            var end = parseInt(params[1]);
            if(!end) return member.send("Hibás idő ("+params[1]+")");
            if(end < 1 && end > 10) return member.send("Csak 1 és 10 perc között lehet");
            
            Giveaway.code = params[0];
            Giveaway.startedBy = member.user.username;
            var D = new Date().toJSON().slice(0,19);
            Giveaway.startedDate = D.split('T')[0].replace('-','.');
            Giveaway.startedAt = D.split('T')[1];
            Giveaway.started = true;
            Giveaway.channel = ch;
            Giveaway.end = Date.now()/1E3+end*60;
            ch.send({
                "embed": {
                  "title": "🔥 Nyereményjáték 🔥",
                  "description": "Ha szerencséd van, "+end+" perc múlva megnyerhetsz egy játékot!\n**Sok sikert**!\n\nA játékban való részvételhez kattints az alábbi emojira:",
                  "color": 16720160,
                  "thumbnail": {
                    "url": "https://i.imgur.com/8XWbbsi.png"
                  }
                }
              }).then(sent => {
                Giveaway.message = sent;
                sent.react('🔥');
                setTimeout(GiveawayOneMinuteLeft, Math.floor(Giveaway.end-Date.now()/1E3-60)*1000);
            })
            .catch(console.log);
        break;
        case 'cancel':
            if(!Giveaway.started) return;
            Giveaway.message.delete();
            Giveaway.started = false;
            // todo kill timeout
            break;
    }
}

function GiveawayOneMinuteLeft() {
    if(Giveaway.started == false) return;
    Giveaway.channel.send({
        "embed": {
            "title": "🔥 Nyereményjáték 🔥",
            "description": "1 perc múlva sorsolás!\nEddig **"+GiveawayGetMembers().length+"** ember csatlakozott a játékhoz.",
            "color": 16720160
        }
    });
    setTimeout(GiveawayWinner,60E3);
}

function GiveawayGetMembers() {
    if(Giveaway.started == false) return [];
    var reacc = Giveaway.message.reactions.array();
    reacc = reacc.find(x=>x.emoji == '🔥');
    if(!reacc) return [];
    reacc = reacc.users.array();
    var users = [];
    reacc.forEach(x=>{
        if(x.id != '532640242277154816') users.push(x);
    })
    return users;
}

function GiveawayWinner() {
    if(Giveaway.started == false) return;
    var members = GiveawayGetMembers();
    Giveaway.started = false;
    if(members.length == 0) return Giveaway.channel.send({"embed":{"title":"🔥 Nyereményjáték 🔥","description":"Nem volt résztvevő a játékon."}});
    var winner = members[Math.floor(Math.random()*members.length)];
    Giveaway.channel.send({
        "embed": {
            "title": "🔥 Nyereményjáték 🔥",
            "description": "Nyertes: **"+winner.username+"**!\nGratulálunk! Megkaptad a kódot privátban.\nAmennyiben mégsem, írj neki: "+Giveaway.startedBy,
            "color": 16720160
        }
    });
    winner.send({"embed":{"title":Giveaway.code}});
}

function Rookie() {
	var g = SzkepGuild();
	var m = g.members.array();
	console.log(m.map.length);
	m.map(x=>{
		if(x.roles.array().length == 0) console.log(x.name);
	});
}

function HelpCmd(msg, params) {
	let cmd = params[0];
	if(aliaslist.hasOwnProperty(cmd)) cmd = aliaslist[cmd];
	if(!commands.hasOwnProperty(cmd)) return reply(msg, 'Nem található ilyen parancs. A listához írd be a !help parancsot.','',0xFFAA00);
	let desc = "**Parancs:** "+cmd;
	
	desc += "\n**Aliasok:** ";
	cmd = commands[cmd];
	if(!cmd.hasOwnProperty("alias")) desc += '(nincs)';
	else desc += cmd.alias.join(', ');
	
	desc += "\n**Paraméterek:** ";
	if(!cmd.hasOwnProperty("params")) desc += '(nincs)';
	else desc += '<'+cmd.params.join('>, <')+'>';
	
	desc += "\n**Leírás:** ";
	if(!cmd.hasOwnProperty("description")) desc += '(nincs)';
	else desc += cmd.description;
	
	msg.channel.send({embed:{title:"Parancs információk",description:desc}});
}

function ClearChat(msg, params) {
    const text   = msg.content.toLowerCase();
    let member   = msg.member;
    let roles    = SzkepGuild().roles;
    let Modi	 = roles.find(x=>x.name=="Moderátorok");
    let Admin	 = roles.find(x=>x.name=="Admin");
	if(!member.roles.has(Modi.id) && !member.roles.has(Admin.id)) return reply(msg, 'Nincs jogod törölni a chatet!', '', 0xFF0000);
	if(params.length != 1) return reply(msg, 'Add meg a mennyiséget is! (1-10)','',0xFFAA00);
	let quantity = parseInt(params[0]) || 0;
    if(quantity < 1 || quantity > 10) return reply(msg, 'Minimum 0, maximum 10 lehet a mennyiség.', '', 0xFFAA00);
    msg.channel.bulkDelete({limit: quantity});
}

function VoiceVolume(msg, params) {
	if(BotInDifferentVoiceChannel(msg)) return MemberVoiceChannelError(msg);
    if(!dispatcher) return;
    if(params.length == 0) return;
	streamVolume = params[0]/100;
    dispatcher.setVolume(streamVolume);
}

function VoiceEnterChannel(msg,cb) {
	if(BotInDifferentVoiceChannel(msg)) return MemberVoiceChannelError(msg);
    msg.member.voiceChannel.join().then(function(conn) {
        VoiceConnection = conn;
        if(cb) cb();
    });
    return true;
}

function VoiceLeaveChannel(msg) {
	if(BotInDifferentVoiceChannel(msg)) return MemberVoiceChannelError(msg);

    if(VoiceConnection) {
        VoiceConnection.disconnect();
        VoiceConnection = false;
    }
    if(bot.member.voiceChannel) bot.member.voiceChannel.leave();
}

function SearchAndPlay(params) {
    const streamOptions = {
        seek: 0,
        volume: streamVolume,
        bitrate: 48000,
        passes: 2
    };
    if(/^http[s]?:\/\//.test(params[0])) {
        url = params[0];
        let stream = ytdl(url, {filter:'audioonly'});
        dispatcher = VoiceConnection.playStream(stream,streamOptions);
    } else {
        ytsearch(params.join(' '), {maxResults:1,key:''}, function(e,r){
            if(e) return console.log(e);
            url = 'https://youtu.be/'+r[0].id; 
            let stream = ytdl(url, {filter:'audioonly'});
            dispatcher = VoiceConnection.playStream(stream,streamOptions);
        });
    }
}

function VoicePlay(msg,params) {
	if(BotInDifferentVoiceChannel(msg)) return MemberVoiceChannelError(msg);
    if(params.length == 0) return ParamLengthError(msg);
    if(!bot.member.voiceChannel) {
        let enter = VoiceEnterChannel(msg,()=>{SearchAndPlay(params);});
        if(enter != true) return;
    } else SearchAndPlay(params);
}

function VoiceStop(msg) {
	if(BotInDifferentVoiceChannel(msg)) return MemberVoiceChannelError(msg);
    if(dispatcher) dispatcher.end();
}

function IncomingPM(msg) {
    const text   = msg.content.toLowerCase();
    let member   = SzkepGuild().members.find(x=>x.id==msg.author.id);
    
    if(!member) return;
    if(text.startsWith('!giveaway')) return GiveawayCmd(msg, member);

    let roles    = SzkepGuild().roles;
    let Szkepper = roles.find(x=>x.name=="Szkepper");
    let Szkepina = roles.find(x=>x.name=="Szkepina");
    switch(text) {
        case 'fiu':
        case 'fiú':
            if(member.roles.has(Szkepper.id) || member.roles.has(Szkepina.id)) return SzkepRankAlert(member);
            member.addRole(Szkepper);
            break;
        case 'lany':
        case 'lány':
            if(member.roles.has(Szkepper.id) || member.roles.has(Szkepina.id)) return SzkepRankAlert(member);
            member.addRole(Szkepina);
            break;
        default:
            return;
    }
    member.send({"embed":{"color":65280,"title":"Megkaptad a rangodat!","description":"Kellemes időtöltést kívánunk."}});
}

function IncomingMSG(msg) {
    if(msg.content.startsWith('!')) CommandHandler(msg);
}

function botError(e) {
    console.log('------------');
    console.log('DC BOT ERROR');
    console.log(e);
    console.log('------------');
}
