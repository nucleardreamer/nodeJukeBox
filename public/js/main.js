var subs = {};
$.subpub = function(id) {
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

var main = function(opts, cb) {
    this.opts = opts;
    this.init(cb);
}

main.prototype.init = function(cb) {
    var _this = this;
    _this.opts.tmpl = {};
    _this.bindSockets();
    _this.bindAddress();
    _this.bindSubscriptions(50);

    _this.song.init.call(_this, null);

    var queue = [];

    var loaders = [];

    loaders.push(_this.loadTemplates());

    $.when.apply(this, loaders).done(function() {
        $.when(
            $.get('/api/getFileSorted', function(d) {
                console.log(d);
                _this.opts.metaSorted = d;
                $.subpub('metaDataSorted')._pub(d);
            }),
            $.get('/api/getFileMD', function(d) {
                console.log(d);
                _this.opts.metaData = d;
                $.subpub('metaData')._pub({
                    'metaData': d
                });
            })

        ).done(function() {
            _this.renderPages();
        });

    })
    if (cb) cb();
};
main.prototype.bindSockets = function() {
    console.log('*** BINDING SOCKETS')
    var _this = this;
    _this.socket = io.connect('http://localhost:8080');
    _this.socket.on('files', function(data) {
        console.log(data);
    });
    $.subpub('song.playing')._sub(function(d) {
        _this.socket.emit('song.playing', d);
    });
    $.subpub('song.ended')._sub(function(d) {
        _this.socket.emit('song.ended', d);
    });
    $.subpub('song.add')._sub(function(d) {
        _this.socket.emit('song.add', d);
    });
}

main.prototype.bindSubscriptions = function(delay) {
    var _this = this;
    // subscribe to address changes, go to default page if none
    $.subpub('address')._sub(function(d) {
        $.address.value(d);
        $('#container').children('div').hide();
        $('#' + d[0]).show();
        setTimeout(function() {
            _this.onLivePages[d[0]].call(_this, $('#' + d[0]));
            if (_this.iscroll) _this.iscroll.refresh();
        }, delay || 0);

    });
    $('[data-song]').live('click', function() {
        var path = $(this).attr('data-song');
        _this.song.add.call(_this, path);
    })
    $('.menu > div').live('click', function() {
        $('.menu > div, .list > div > div').each(function() {
            $(this).removeClass('selected');
        });
        var thisMenu = $(this).attr('class');
        $(this).addClass('selected');
        $('.list .' + thisMenu).addClass('selected');
        _this.iscroll.refresh();
    });
    $('#select .playing').live('click', function() {
        $.address.value('queue');
    })
}

main.prototype.song = {
    selector: '#player',
    transitionTime: 1000,
    queue: [],
    init: function() {
        var _this = this;
        _this.song.el = new Audio();
        _this.song.el.addEventListener('timeupdate', function() {
            _this.song.playing.call(_this);
        });
        _this.song.el.addEventListener('ended', function() {
            _this.song.ended.call(_this);
        });
    },
    add: function(d) {
        var _this = this;
        _this.song.queue.push(d);
        if (_this.song.queue.length == 1) {
            _this.song.play.call(_this);
        }
        $.subpub('song.add')._pub(d);
    },
    play: function() {
        var _this = this;
        var upNext = _this.song.queue[0];
        _this.song.el.src = _this.replaceMusicPath(upNext);
        _this.song.el.play();
        $(_this.opts.metaData).each(function(i, e) {
            if (e.path == upNext) {
                e.duration = _this.song.el.duration
                $.subpub('song.play')._pub(e);
            }
        });
    },
    playing: function(e) {
        var _this = this;
        var time = _this.song.el.currentTime;
        $.subpub('song.playing')._pub({
            time: time,
            duration: _this.song.el.duration,
            path: _this.song.queue[0]
        });
    },
    ended: function() {
        var _this = this;
        $.subpub('song.ended')._pub({
            path: _this.song.queue.shift()
        });
        setTimeout(function() {
            if (_this.song.queue.length !== 0) {
                _this.song.play.call(_this)
            } else {
                _this.song.reset();
            }
        }, _this.song.transitionTime);
    },
    reset: function() {
        $('[data-control="status"]')
            .find('.title').text('Nothing!').end()
            .find('.bar .progress .time').text('00:00').end()
            .find('.album, .cont').css('background-image', '');
    }
}
main.prototype.controls = {
    init: function() {
        var _this = this;
        $('[data-control]').each(function(e, i) {
            var control = $(this).attr('data-control');
            _this.controls[control].call(_this, $(this));
        })
    },
    status: function(obj) {
        var _this = this;
        $.subpub('song.play')._sub(function(d) {
            obj.find('.title').text(d.title + ' - ' + d.artist);
            var img = _this.replaceMusicPath(d.path).split('/');
            img.pop();
            obj.addClass('on').find('.album').css('background-image', 'url("' + img.join('/') + '/album.jpg")');
        });
        $.subpub('song.playing')._sub(function(d) {
            var sec = new Date(null);
            sec.setSeconds(Math.round(d.time));
            var print = moment(sec).format('mm:ss');
            obj.find('.bar').find('.progress').css('width', (d.time / d.duration * 100) + '%').end().find('.time').text(print);
        });
        $.subpub('song.ended')._sub(function(d) {
            obj.find('.progress').css('width', '0px');
            obj.removeClass('on');
        })
    }
}
main.prototype.renderPages = function(opts, cb) {
    var _this = this;
    var pages = [
        "queue",
        "select",
        "search"
    ]
    // map the pages data
    $.map(pages, function(v, k) {
        // render templates according to the page id (matches template)
        $('#' + v, '#container').append($.render[v]({
            id: v
        }));
        _this.onLoadPages[v].call(_this, $('#' + v));
    });

    _this.controls.init.call(_this, null);
};
main.prototype.loadTemplates = function(cb) {
    var _this = this;
    var dfd = $.Deferred();
    var tmpl = _this.opts.tmpl;
    //load the template file
    var cachebust = new Date().getTime();
    return $.when($.get('templates/main.tmpl.html' + '?t=' + cachebust)).done(function(tmplData) {
        // when done, itterate
        var data = $(tmplData);
        data.each(function(k, v) {
            // grab the html
            var _item = $(v)[0];
            // set internal tmpl with key as the id, value as the html if it exists already
            if (_item.nodeName == 'SCRIPT') {
                tmpl[_item.id.replace('#', '')] = _item.innerHTML.trim();
            }
        });
        // bind the templates to jsrender
        $.templates(tmpl);
        return dfd.promise();
    });
};

main.prototype.bindAddress = function() {
    var _this = this;
    $.address.change(function(e) {
        e.pathNames = (e.pathNames.length == 0) ? [_this.opts.defaultPage] : e.pathNames;
        $.subpub('address')._pub(e.pathNames);
    });
};

// called on render
main.prototype.onLoadPages = {
    select: function(obj) {
        var _this = this;
        var lists = [
            'album',
            'artist',
            'genre',
            'song'
        ];
        $.map(lists, function(e, i) {
            var torender = [];
            if (e !== 'song') {
                for (key in _this.opts.metaSorted[e]) {
                    torender.push({
                        key: key,
                        path: _this.replaceMusicPath(_this.opts.metaSorted[e][key][0].path),
                        artist: _this.opts.metaSorted[e][key][0].artist,
                        album: _this.opts.metaSorted[e][key][0].album,
                        data: _this.opts.metaSorted[e][key]
                    });
                }
                console.log(torender);
                $('.list .' + e, obj).html($.render['select_' + e](torender));

            } else {
                $('.list .' + e, obj).html($.render['select_' + e](_this.opts.metaData));
            }

        });
        setTimeout(function() {
            _this.iscroll = new iScroll('list');
        }, 100)
    },
    queue: function(obj) {},
    search: function(obj) {}
}

// called when address changes
main.prototype.onLivePages = {
    queue: function(obj) {

    },
    select: function(obj) {

    },
    search: function(obj) {}

}

main.prototype.replaceMusicPath = function(path) {
    return path.replace('public/music', 'music');
}
var app;
$.views.helpers({
    processPath: function(val) {
        val = app.replaceMusicPath(val);
        val = val.split('/');
        val.pop();
        return val.join('/');
    }
})
$(document).ready(function() {

    app = new main({
        defaultPage: 'select'
    }, function() {
        console.log('*** INIT ***');
    });

});