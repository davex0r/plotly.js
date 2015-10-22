'use strict';

var Plotly = require('../../plotly');

var createScatter = require('gl-scatter2d');
var createFancyScatter = require('gl-scatter2d-fancy');
var createLine = require('gl-line2d');
var createError = require('gl-error2d');

var str2RGBArray = require('../../gl3d/lib/str2rgbarray');
var formatColor = require('../../gl3d/lib/format-color');

var MARKER_SYMBOLS = require('../../gl3d/lib/markers.json');
var DASHES = require('../lib/dashes.json');


function LineWithMarkers(scene, uid) {
    this.scene = scene;
    this.uid = uid;

    this.xData = [];
    this.yData = [];
    this.textLabels = [];
    this.color = 'rgb(0, 0, 0)';
    this.name = '';
    this.hoverinfo = 'all';

    this.idToIndex = [];
    this.bounds = [0, 0, 0, 0];

    this.hasLines = false;
    this.lineOptions = {
      positions: new Float32Array(),
      color: [0, 0, 0, 1],
      width: 1,
      fill: [false, false, false, false],
      fillColor:  [
          [0, 0, 0, 1],
          [0, 0, 0, 1],
          [0, 0, 0, 1],
          [0, 0, 0, 1]],
      dashes: [1]
    };
    this.line = createLine(scene.glplot, this.lineOptions);
    this.line._trace = this;

    this.hasErrorX = false;
    this.errorXOptions = {
        positions: new Float32Array(),
        errors: new Float32Array(),
        lineWidth: 1,
        capSize: 0,
        color: [0, 0, 0, 1]
    };
    this.errorX = createError(scene.glplot, this.errorXOptions);
    this.errorX._trace = this;

    this.hasErrorY = false;
    this.errorYOptions = {
        positions: new Float32Array(),
        errors: new Float32Array(),
        lineWidth: 1,
        capSize: 0,
        color: [0, 0, 0, 1]
    };
    this.errorY = createError(scene.glplot, this.errorYOptions);
    this.errorY._trace = this;

    this.hasMarkers = false;
    this.scatterOptions = {
        positions: new Float32Array(),
        sizes: [],
        colors: [],
        glyphs: [],
        borderWidths: [],
        borderColors: [],
        size: 12,
        color: [0, 0, 0, 1],
        borderSize: 1,
        borderColor: [0, 0, 0, 1]
    };
    this.scatter = createScatter(scene.glplot, this.scatterOptions);
    this.scatter._trace = this;
    this.fancyScatter = createFancyScatter(scene.glplot, this.scatterOptions);
    this.fancyScatter._trace = this;
}

var proto = LineWithMarkers.prototype;

proto.handlePick = function(pickResult) {
    var index = this.idToIndex[pickResult.pointId];

    return {
        trace: this,
        dataCoord: pickResult.dataCoord,
        traceCoord: [
            this.xData[index],
            this.yData[index]
        ],
        textLabel: Array.isArray(this.textLabels) ?
            this.textLabels[index] :
            this.textLabels,
        color: Array.isArray(this.color) ?
            this.color[index] :
            this.color,
        name: this.name,
        hoverinfo: this.hoverinfo
    };
};

// check if trace is fancy
proto.isFancy = function(options) {
    if(this.scene.xaxis.type !== 'linear') return true;
    if(this.scene.yaxis.type !== 'linear') return true;

    if(!options.x || !options.y) return true;

    var marker = options.marker || {};
    if(Array.isArray(marker.symbol) ||
         marker.symbol !== 'circle' ||
         Array.isArray(marker.size) ||
         Array.isArray(marker.line.width) ||
         Array.isArray(marker.opacity)
    ) return true;

    var markerColor = marker.color;
    if(Array.isArray(markerColor)) return true;

    var lineColor = Array.isArray(marker.line.color);
    if(Array.isArray(lineColor)) return true;

    if(this.hasErrorX) return true;
    if(this.hasErrorY) return true;

    return false;
};

// handle the situation where values can be array-like or not array like
function convertArray(convert, data, count) {
    if(!Array.isArray(data)) data = [data];

    return _convertArray(convert, data, count);
}

function _convertArray(convert, data, count) {
    var result = new Array(count);

    for(var i = 0; i < count; ++i) {
        result[i] = (i >= data.length) ?
            convert(data[0]) :
            convert(data[i]);
    }

    return result;
}

var convertNumber = convertArray.bind(null, function(x) { return +x; });
var convertColorBase = convertArray.bind(null, str2RGBArray);
var convertSymbol = convertArray.bind(null, function(x) {
    return MARKER_SYMBOLS[x] || '●';
});

function convertColor(color, opacity, count) {
    return _convertColor(
        convertColorBase(color, count),
        convertNumber(opacity, count),
        count
    );
}

function convertColorScale(containerIn, markerOpacity, traceOpacity, count) {
    var colors = formatColor(containerIn, markerOpacity, count);

    colors = Array.isArray(colors[0]) ?
        colors :
        _convertArray(Plotly.Lib.identity, [colors], count);

    return _convertColor(
        colors,
        convertNumber(traceOpacity, count),
        count
    );
}

function _convertColor(colors, opacities, count) {
    var result = new Array(4 * count);

    for(var i = 0; i < count; ++i) {
        for(var j = 0; j < 3; ++j) result[4*i+j] = colors[i][j];
        result[4*i+3] = colors[i][j] * opacities[i];
    }

    return result;
}

/* Order is important here to get the correct laying:
 * - lines
 * - errorX
 * - errorY
 * - markers
 */
proto.update = function(options) {
    if(options.visible !== true) {
        this.hasLines = false;
        this.hasErrorX = false;
        this.hasErrorY = false;
        this.hasMarkers = false;
    }
    else {
        this.hasLines = Plotly.Scatter.hasLines(options);
        this.hasErrorX = options.error_x.visible === true;
        this.hasErrorY = options.error_y.visible === true;
        this.hasMarkers = Plotly.Scatter.hasMarkers(options);
    }

    this.textLabels = options.text;

    // not quite on-par with 'scatter', but close enough for now
    // does not handle the colorscale case
    this.color = this.hasMarkers ?  options.marker.color : options.line.color;

    this.name = options.name;
    this.hoverinfo = options.hoverinfo;

    this.bounds = [Infinity, Infinity, -Infinity, -Infinity];

    if(this.isFancy(options)) {
        console.log('fancy update')
        this.updateFancy(options);
    }
    else {
        console.log('fast update')
        this.updateFast(options);
    }
};


proto.updateFast = function(options) {
    var x = this.xData = options.x;
    var y = this.yData = options.y;

    var len = x.length,
        idToIndex = new Array(len),
        positions = new Float32Array(2 * len),
        bounds = this.bounds,
        pId = 0,
        ptr = 0;

    var xx, yy;

    for(var i = 0; i < len; ++i) {
        xx = x[i];
        yy = y[i];

        if(isNaN(xx) || isNaN(yy)) continue;

        idToIndex[pId++] = i;

        positions[ptr++] = xx;
        positions[ptr++] = yy;

        bounds[0] = Math.min(bounds[0], xx);
        bounds[1] = Math.min(bounds[1], yy);
        bounds[2] = Math.max(bounds[2], xx);
        bounds[3] = Math.max(bounds[3], yy);
    }

    positions = positions.slice(0, ptr);
    this.idToIndex = idToIndex;

    this.updateLines(options, positions);
    this.updateError('X', options);
    this.updateError('Y', options);

    if(this.hasMarkers) {
        this.scatterOptions.positions = positions;

        var markerColor = str2RGBArray(options.marker.color),
            borderColor = str2RGBArray(borderColor),
            opacity = (+options.opacity) * (+options.marker.opacity);

        markerColor[3] *= opacity;
        this.scatterOptions.color = markerColor;

        borderColor[3] *= opacity;
        this.scatterOptions.borderColor = borderColor;

        this.scatterOptions.size = options.marker.size;
        this.scatterOptions.borderSize = +options.marker.line.width;

        this.scatter.update(this.scatterOptions);
    }
    else {
        this.scatterOptions.positions = new Float32Array();
        this.scatterOptions.glyphs = [];
        this.scatter.update(this.scatterOptions);
    }

    // turn off fancy scatter plot
    this.scatterOptions.positions = new Float32Array();
    this.scatterOptions.glyphs = [];
    this.fancyScatter.update(this.scatterOptions);
};

proto.updateFancy = function(options) {
    var scene = this.scene,
        xaxis = scene.xaxis,
        yaxis = scene.yaxis,
        bounds = this.bounds;

    // makeCalcdata runs d2c (data-to-coordinate) on every point
    var x = this.xData = xaxis.makeCalcdata(options, 'x');
    var y = this.yData = yaxis.makeCalcdata(options, 'y');

    // get error values
    var errorVals = Plotly.ErrorBars.calcFromTrace(options, scene.fullLayout);

    var len = x.length,
        idToIndex = new Array(len),
        positions = new Float32Array(2 * len),
        errorsX = new Float32Array(4 * len),
        errorsY = new Float32Array(4 * len),
        pId = 0,
        ptr = 0,
        ptrX = 0,
        ptrY = 0;

    var getX = (xaxis.type === 'log') ?
            function(x) { return xaxis.d2l(x); } :
            function(x) { return x; };
    var getY = (yaxis.type === 'log') ?
            function(y) { return yaxis.d2l(y); } :
            function(y) { return y; };

    var i, j, xx, yy, ex0, ex1, ey0, ey1;

    for(i = 0; i < len; ++i) {
        xx = getX(x[i]);
        yy = getY(y[i]);

        if(isNaN(xx) || isNaN(yy)) continue;

        idToIndex[pId++] = i;

        positions[ptr++] = xx;
        positions[ptr++] = yy;

        ex0 = errorsX[ptrX++] = xx - errorVals[i].xs || 0;
        ex1 = errorsX[ptrX++] = errorVals[i].xh - xx || 0;
        errorsX[ptrX++] = 0;
        errorsX[ptrX++] = 0;

        errorsY[ptrY++] = 0;
        errorsY[ptrY++] = 0;
        ey0 = errorsY[ptrY++] = yy - errorVals[i].ys || 0;
        ey1 = errorsY[ptrY++] = errorVals[i].yh - yy || 0;

        bounds[0] = Math.min(bounds[0], xx - ex0);
        bounds[1] = Math.min(bounds[1], yy - ey0);
        bounds[2] = Math.max(bounds[2], xx + ex1);
        bounds[3] = Math.max(bounds[3], yy + ey1);
    }

    positions = positions.slice(0, ptr);
    this.idToIndex = idToIndex;

    this.updateLines(options, positions);
    this.updateError('X', options, positions, errorsX);
    this.updateError('Y', options, positions, errorsY);

    if(this.hasMarkers) {
        this.scatterOptions.positions = positions;

        // TODO rewrite convert function so that
        // we don't have to loop through the data another time

        this.scatterOptions.sizes = new Array(pId);
        this.scatterOptions.glyphs = new Array(pId);
        this.scatterOptions.borderWidths = new Array(pId);
        this.scatterOptions.colors = new Array(pId * 4);
        this.scatterOptions.borderColors = new Array(pId * 4);

        var markerSizeFunc = Plotly.Scatter.getBubbleSizeFn(options),
            markerOpts = options.marker,
            markerOpacity = markerOpts.opacity,
            traceOpacity = options.opacity,
            sizes = convertArray(markerSizeFunc, markerOpts.size, len),
            colors = convertColorScale(markerOpts, markerOpacity, traceOpacity, len),
            glyphs = convertSymbol(markerOpts.symbol, len),
            borderWidths = convertNumber(markerOpts.line.width, len),
            borderColors = convertColorScale(markerOpts.line, markerOpacity, traceOpacity, len),
            index;

        for(i = 0; i < pId; ++i) {
            index = idToIndex[i];

            this.scatterOptions.sizes[i] = 4.0 * sizes[index];
            this.scatterOptions.glyphs[i] = glyphs[index];
            this.scatterOptions.borderWidths[i] = 0.5 * borderWidths[index];

            for(j = 0; j < 4; ++j) {
                this.scatterOptions.colors[4*i+j] = colors[4*index+j];
                this.scatterOptions.borderColors[4*i+j] = borderColors[4*index+j];
            }
        }

        this.fancyScatter.update(this.scatterOptions);

        // not quite on-par with 'scatter', but close enough for now
        var expandOpts = { padded: true, ppad: sizes };
        Plotly.Axes.expand(xaxis, x, expandOpts);
        Plotly.Axes.expand(yaxis, y, expandOpts);
    }
    else {
        this.scatterOptions.positions = new Float32Array();
        this.scatterOptions.glyphs = [];
        this.fancyScatter.update(this.scatterOptions);
    }

    // turn off fast scatter plot
    this.scatterOptions.positions = new Float32Array();
    this.scatterOptions.glyphs = [];
    this.scatter.update(this.scatterOptions);
};

proto.updateLines = function(options, positions) {
    if(this.hasLines) {
        this.lineOptions.positions = positions;

        var lineColor = str2RGBArray(options.line.color);
        if(this.hasMarkers) lineColor[3] *= options.marker.opacity;

        var lineWidth = Math.round(0.5 * this.lineOptions.width),
            dashes = (DASHES[options.line.dash] || [1]).slice();

        for(var i = 0; i < dashes.length; ++i) dashes[i] *= lineWidth;

        switch(options.fill) {
          case 'tozeroy':
              this.lineOptions.fill = [false, true, false, false];
          break;
          case 'tozerox':
              this.lineOptions.fill = [true, false, false, false];
          break;
          default:
              this.lineOptions.fill = [false, false, false, false];
          break;
        }

        var fillColor = str2RGBArray(options.fillcolor);

        this.lineOptions.color = lineColor;
        this.lineOptions.width = 2.0 * options.line.width;
        this.lineOptions.dashes = dashes;
        this.lineOptions.fillColor = [fillColor, fillColor, fillColor, fillColor];
    }
    else {
        this.lineOptions.positions = new Float32Array();
    }

    this.line.update(this.lineOptions);
};

proto.updateError = function(axLetter, options, positions, errors) {
    var errorObj = this['error' + axLetter],
        errorOptions = options['error_' + axLetter.toLowerCase()],
        errorObjOptions = this['error' + axLetter + 'Options'];

    if(this['hasError' + axLetter]) {
        errorObjOptions.positions = positions;
        errorObjOptions.errors = errors;
        errorObjOptions.capSize = errorOptions.width;
        errorObjOptions.lineWidth = errorOptions.thickness / 2;  // ballpark rescaling
        errorObjOptions.color = convertColor(errorOptions.color, 1, 1);
    }
    else {
        errorObjOptions.positions = new Float32Array();
    }

    errorObj.update(errorObjOptions);
};

proto.dispose = function() {
    this.line.dispose();
    this.errorX.dispose();
    this.errorY.dispose();
    this.scatter.dispose();
    this.fancyScatter.dispose();
};

function createLineWithMarkers(scene, data) {
    var plot = new LineWithMarkers(scene, data.uid);
    plot.update(data);
    return plot;
}

module.exports = createLineWithMarkers;
