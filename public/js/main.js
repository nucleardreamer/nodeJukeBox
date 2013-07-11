var subs = {};
$.subpub = function (id) {
    var callbacks,
        method,
        sub = id && subs[id];
    if (!sub) {
        callbacks = $.Callbacks();
        sub = {
            _pub: callbacks.fire,
            _sub: callbacks.add,
            _unsub: callbacks.remove
        };
        if (id) {
            subs[id] = sub;
        }
    }
    return sub;
};

var main = function(opts,cb){
	this.opts = opts;
	this.init(cb);
}

main.prototype.init = function (cb){
	var _this = this;
	_this.opts.tmpl = {};
	_this.bindSockets();
	_this.bindAddress();
	_this.bindSubscriptions(50);

    _this.song.init.call(_this, null);

    var queue = [];

    var loaders = [];

    loaders.push(_this.loadTemplates());

    $.when.apply(this, loaders).done(function () {
        console.log('*** done loading');

		$.get('/api/getFileMD',function(d){
			_this.opts.metaData = d;
            console.log(_this.opts.metaData);
			$.subpub('metaData')._pub({'metaData':d});
            _this.renderPages();
		});
    })
	if(cb)cb();
};
main.prototype.bindSockets = function (){
    console.log('*** BINDING SOCKETS')
    var _this = this;
	_this.socket = io.connect('http://localhost:8080');
	_this.socket.on('files', function (data) {
		console.log(data);
	});
    $.subpub('song.playing')._sub(function(d){
        _this.socket.emit('song.playing',d);
    });
    $.subpub('song.ended')._sub(function(d){
        _this.socket.emit('song.ended',d);
    });
    $.subpub('song.add')._sub(function(d){
        _this.socket.emit('song.add',d);
    });
}

main.prototype.bindSubscriptions = function (delay){
	var _this = this;
	// subscribe to address changes, go to default page if none
	$.subpub('address')._sub(function (d) {
		$.address.value(d);
		$('#container').children('div').hide();
		$('#'+d[0]).show();
        setTimeout(function(){
            _this.onLivePages[d[0]].call(_this, $('#'+d[0]));
        }, delay || 0);
	});
    $('[data-song]').live('click',function(){
        var path = $(this).attr('data-song');
        _this.song.add.call(_this, path);
    })
}
main.prototype.song = {
    selector: '#player',
    transitionTime: 1000,
    queue: [],
    init: function(){
        var _this = this;
        _this.song.el = new Audio();
        _this.song.el.addEventListener('timeupdate', function(){
            _this.song.playing.call(_this);
        });
        _this.song.el.addEventListener('ended', function(){
            _this.song.ended.call(_this);
        });
    },
    add: function (d){
        var _this = this;
        _this.song.queue.push(d);
        console.log(_this.song.queue);
        if(_this.song.queue.length == 1){
            _this.song.play.call(_this);
        }
        $.subpub('song.add')._pub(d);
    },
    play: function (){
        var _this = this;
        var upNext = _this.song.queue[0];
        _this.song.el.src = upNext.replace('public/music','music');
        console.log(_this.song.el);
        _this.song.el.play();
        $(_this.opts.metaData).each(function(i,e){
            if(e.path == upNext){
                e.duration = _this.song.el.duration
                $.subpub('song.play')._pub(e);
            }
        })
        
    },
    playing: function(e){
        var _this = this;
        var time = _this.song.el.currentTime;
        $.subpub('song.playing')._pub({
            time: time,
            duration: _this.song.el.duration,
            path: _this.song.queue[0]
        });
    },
    ended: function(){
        var _this = this;
        $.subpub('song.ended')._pub({
            path: _this.song.queue.shift()
        });
        console.log(_this.song.queue);
        setTimeout(function(){
            _this.song.play.call(_this);
        },_this.song.transitionTime);
    }
}
main.prototype.controls = {
    init: function(){
        var _this = this;
        $('[data-control]').each(function(e,i){
            var control = $(this).attr('data-control');
            _this.controls[control].call(_this, $(this));
        })
    },
    status: function(obj){
        var _this = this;
        console.log('status')
        $.subpub('song.play')._sub(function(d){
            obj.find('.title').text(d.title + ' - ' + d.artist.join(', '));
            var img = d.path.replace('public/music','music').split('/');
            img.pop();
            obj.addClass('on').find('.album').css('background-image','url("'+img.join('/')+'/album.jpg")');
        });
        $.subpub('song.playing')._sub(function(d){
            var sec = new Date(null);
            sec.setSeconds(Math.round(d.time));
            var print = moment(sec).format('mm:ss');
            obj.find('.bar').find('.progress').css('width',(d.time / d.duration * 100)+'%').end().find('.time').text(print);
        });
        $.subpub('song.ended')._sub(function(d){
            obj.find('.progress').css('width','0px');
            obj.removeClass('on');
        })
    }
}
main.prototype.renderPages = function (opts, cb) {
    var _this = this;
    var pages = [
    	"queue",
    	"select",
        "search"
    ]
    // map the pages data
    $.map(pages, function (v, k) {
        // render templates according to the page id (matches template)
        $('#'+v,'#container').append($.render[v]({
            id: v
        }));
        _this.onLoadPages[v].call(_this, $('#'+v));
    });

    _this.controls.init.call(_this, null);
};
main.prototype.loadTemplates = function (cb) {
    var _this = this;
    var dfd = $.Deferred();
    var tmpl = _this.opts.tmpl;
    //load the template file
    var cachebust = new Date().getTime();
    return $.when($.get('templates/main.tmpl.html' + '?t=' + cachebust)).done(function (tmplData) {
        // when done, itterate
        var data = $(tmplData);
        data.each(function (k, v) {
            // grab the html
            var _item = $(v)[0];
            // set internal tmpl with key as the id, value as the html if it exists already
            if (_item.nodeName == 'SCRIPT') {

                tmpl[_item.id.replace('#', '')] = _item.innerHTML.trim();
            }
        });
        // bind the templates to jsrender
        $.templates(tmpl);
        console.log('*** templates loaded');
        return dfd.promise();
    });
};

main.prototype.bindAddress = function () {
    var _this = this;
    $.address.change(function (e) {
        e.pathNames = (e.pathNames.length == 0) ? [_this.opts.defaultPage] : e.pathNames;
        $.subpub('address')._pub(e.pathNames);
    });
};

// called on render
main.prototype.onLoadPages = {
    select: function(obj){
        var _this = this;
        var lists = [
            'album',
            'artist',
            'genre',
            'song'
        ];
        $.map(lists,function(e,i){
            $('.list .'+e, obj).html($.render['select_'+e](_this.opts.metaData));
        });
    },
    queue: function(obj){
	},
    search: function(obj){
    }
}

// called when address changes
main.prototype.onLivePages = {
	queue: function(obj){
		
	},
	select: function(obj){

	},
    search: function(obj){
    }

}
var app;

$(document).ready(function(){

	app = new main({
		defaultPage: 'select'
	}, function(){
		console.log('*** INIT ***');
	});

});
