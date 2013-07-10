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
	_this.bindSubscriptions();

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
	var socket = io.connect('http://localhost:8080');
	socket.on('files', function (data) {
		console.log(data);
	});
}
main.prototype.bindSubscriptions = function (){
	var _this = this;
	// subscribe to address changes, go to default page if none
	$.subpub('address')._sub(function (d) {
		$.address.value(d);
		$('#container').children('div').hide();
		$('#'+d[0]).show();
		_this.onLivePages[d[0]].call(_this, $('#'+d[0]));
	});
}
main.prototype.renderPages = function (opts, cb) {
    var _this = this;
    var pages = [
    	"queue",
    	"select"
    ]
    // map the pages data
    $.map(pages, function (v, k) {
        // render templates according to the page id (matches template)
        $('#'+v,'#container').append($.render[v]({
            id: v
        }));
        _this.onLoadPages[v].call(_this, $('#'+v));
    });
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
	queue: function(obj){
		console.log('queue');
	},
	select: function(obj){
        var _this = this;
		console.log('select');
		obj.html($.render.select_item(_this.opts.metaData))
	}
}

// called when address changes
main.prototype.onLivePages = {
	queue: function(obj){
		console.log('live queue');
	},
	select: function(obj){
		console.log('live select');

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
