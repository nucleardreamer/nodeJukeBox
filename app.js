var events = require('events');
var mc = new events.EventEmitter();
    mc.setMaxListeners(0); 
var express = require('express'),
    app     = express(),
    colors  = require('colors'),
    server  = require('http').createServer(app),
    io      = require('socket.io').listen(server),
    walk    = require('walk'),
    connectAssets = require('connect-assets'),

    static_root = __dirname + '/public',
    views = __dirname + '/views';

// configure express
app.configure(function() {
    app.set('views', views);
    app.set('view engine', 'jade');

    // uncompressed html output
    app.locals({
        pretty : true,
        layout: false
    });

    // parses x-www-form-urlencoded request bodies (and json)
    app.use(express.bodyParser());
    app.use(express.methodOverride());

    // main routing
    app.use(app.router);

    // res
    app.use(express.favicon());
    app.use(express.static(static_root));

    app.use(connectAssets({
        src : __dirname + "/public"
    }));
});

server.listen(8080);

app.get('/api/:call', function (req, res){
    var apicall = req.params.call;
    switch(apicall){
        case "getFileMD":
            res.json(_app.store.metaFiles);
            break;
        case "getFileSorted":
            console.log(_app.store.sorted);
            res.json(_app.store.sorted);
            break;
        default:
            break;
    }
})

app.get('/', function (req, res){
    res.render('index', { 
        title: 'musicthing' 
    });
});

// main song queue
var queue = [];

// sockets
io.sockets.on('connection', function (socket) {
    mc.on('ready',function (d){
        socket.emit('ready', d);
    })
    mc.on('metadataParsed', function(_this){
        socket.emit('musicData', _this.store.metaFiles);
        console.log('*** initial metadata parsed'.yellow);
    });
    mc.on('metadataSorted', function(_this){
        socket.emit('musicDataSorted', _this.store.sorted);
        console.log('*** initial sorting parsed'.yellow);
    });
    socket.on('song.add',function(path){
        queue.push(path);
    })
    socket.on('song.playing',function(d){
        console.log(d);
    })
    socket.on('song.ended',function(d){
        queue.shift();
        console.log(queue);
    })
});

// socket config
io.set("log level", 1);
io.set("transports", [
    "websocket",
    "flashsocket",
    "htmlfile",
    "xhr-polling",
    "jsonp-polling"
]);

// main logic object
var main = function(params){
    var _this = this;

    _this.params = params;
    _this.store = {
        files: null,
        sorted: {},
        metaFiles: []
    };
    mc.emit('init', _this);
}

// gets all mp3 files, stores them in store.files on this object
main.prototype.returnFilesFromMusic = function(){
    var _this = this,
        _rootMusicUrl = _this.params.musicUrl,
        files = [];
    
    var walker  = walk.walk(_rootMusicUrl, { followLinks: false });

    walker.on("errors", function (root, nodeStatsArray, next) {
        next();
    });
    
    walker.on('file', function(root, stat, next) {
        var ext = /(?:\.([^.]+))?$/.exec(stat.name)[1];
        if(ext == 'mp3'){
            files.push(root + '/' + stat.name);
        }
        next();
    });

    walker.on('end', function() {
        _this.store.files = files;
        mc.emit('filesParsed', _this);
    });

}

// parses all mp3 files in store.files, and pushes them in store.metaFiles
main.prototype.parseAllFileMeta = function(cb){
    var _this = this,
        _files = _this.store.files,
        fs = require('fs'),
        mm = require('musicmetadata');

        _files.forEach(function(e,i,a){
            var parser = new mm(fs.createReadStream(e));
            parser.on('metadata', function (r) {
                if(_files.length == (i+1)){
                    // dev paranoid - need deferreds
                    setTimeout(function(){ 
                        _this.transformAllFiles();
                        mc.emit('metadataParsed', _this) },500);
                    }
                // minor formatting
                delete r['picture'];
                r.artist = r.artist.join(',');
                r.albumartist = r.albumartist.join(',');
                r.genre = r.genre.join(',');
                r.path = e;

                _this.store.metaFiles.push(r);
            });
        });
        if(cb)cb()
}
main.prototype.transformAllFiles = function(){
    var _this = this,
        toSort = [
            'album',
            'genre',
            'artist'
        ];
    toSort.forEach(function(e,i,a){
        _this.transformFiles(e,function(sorted){
            if(toSort.length == i+1){
                setTimeout(function(){ 
                    mc.emit('metadataSorted', _this);
                },500)
            }
        });
        
    })
}
main.prototype.transformFiles = function(key, cb){
    var _this = this;
    // make the sorted store key
    if(typeof _this.store.sorted[key] == 'undefined'){
        _this.store.sorted[key] = {};
    }
    keyPointer = _this.store.sorted[key];

    // loop through all files
    _this.store.metaFiles.forEach(function(e,i,a){
        // make the key inside sorted 
        if(typeof keyPointer[e[key]] == 'undefined'){
            keyPointer[e[key]] = [];
        }
        keyPointer[e[key]].push(e);
        if(_this.store.metaFiles.length == i+1){
            if(cb)cb(keyPointer);
        }
    })
}

// init logic

mc.on('init', function(_this){
    console.log('*** INIT ***'.green);
    console.log('*** WITH PARAMS: '.yellow);
    console.log(JSON.stringify(_this.params).yellow);
    _this.returnFilesFromMusic();
});

mc.on('filesParsed', function(_this){
    console.log('*** initial files parsed'.yellow)
    _this.parseAllFileMeta();
    
});

var _app = new main({
    musicUrl: 'public/music'
});