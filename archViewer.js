// This is the plot.ly div; all the plot.ly functions work against this div.
var myDiv = document.getElementById('archViewer');

// viewerVars is a struct that contains all the information needed for the viewer;
// To debug, a useful first step is look at viewerVars in the browser console.
var viewerVars = {};
// Some initialization
var now = new Date();
viewerVars.end = now;
viewerVars.start = new Date(now.getTime() - 60*60*1000);
// This contains the list of PV's being displayed.
viewerVars.pvs = [];
// This contains information specific to each pv; there should one dict entry per pv in the above list.
viewerVars.pvData = {};
// Mapping between EGU and axis. For now, we only support 2 axes; the default on the left and the second one on the right.
viewerVars.egu2axis = {};
viewerVars.axis2egu = {};
// We support a limited number of y axes.
viewerVars.supportedYAxes = ['y1', 'y2', 'y3'];
// Plot.ly confusingly names its yaxes differently for traces and the layout.
viewerVars.y_short_2_long = {'y1' : 'yaxis', 'y2' : 'yaxis2', 'y3' : 'yaxis3'};
//To get to the scale title groups, plot.ly uses another scheme for the class associated with the axis title.
viewerVars.y_short_2_axisclass = {'y1' : 'ytitle', 'y2' : 'y2title', 'y3' : 'y3title'};
// The first two y axes get added to the left&right; later ones affect the xaxis range. Maintain these layout changes here.
viewerVars.yaxis_layout_changes = {'y3' : {'position' : 1.00, 'domain': [0, 0.94]}}
// User specifications for the y axes; this is a dict mapping EGU's (not PV's) to yaxes specifications.
viewerVars.egu_yaxis_specs = {}
// Bin size being used for non-raw trace...
viewerVars.binSize = 0;
// Has the user fixed the bin size
viewerVars.userFixedBinSize = false;
// Default binning operator
viewerVars.currentBinningOperator = 'lastSample';
// Sequence of binning operators that we cycle thru.
viewerVars.binningOperatorsList = ['lastSample', 'raw', 'errorbar'];
// Timer for live mode
viewerVars.liveModeTimer = null;
// What kind of plot are we showing now?
viewerVars.plotTypeEnum = {SCATTER_2D : 1, ANIMATE_3D : 2};
viewerVars.plotType = viewerVars.plotTypeEnum.SCATTER_2D;
// Are we animating a 3D plot currently?
viewerVars.currentlyAnimating3DPlot = false;
// If so, the id of the timer that is driving the animation
viewerVars.timerIndexFor3DAnimation = -1;
// Icons for various buttons are store here.
viewerVars.icons = {}
// We take a snapshot of the gd before showing the comment modal. This is stored here
viewerVars.currentSnapshot = null;



// This is one of the integration points with the server.
// This should default to a path relative location that works from the appliance UI.
// To develop/debug, override this to a absolute URL of the server with the data you are going to use for debugging/developing.
viewerVars.serverURL = "../../data";

// We support posting to an elog; by default we post to a "postToElog" endpoint relative to the viewer.
// The endpoint gets a multipart mime document with "comment", "link" and "snapshot" elements.
viewerVars.postToElogURL = "../../../postToElog";

viewerVars.siteSupportsPostToElog = false;

$.get("../../../site_params.json")
.done(function(site_params){
    viewerVars.siteSupportsPostToElog = _.get(site_params, "siteSupportsPostToElog", false);
})



// Google finance like list of time windows..
viewerVars.selectorOptions = {
		buttons: [{step: 'second',  stepmode: 'backward', count: 30, label: '30s'   },
		          {step: 'minute',  stepmode: 'backward', count: 1,  label: '1m'    },
		          {step: 'minute',  stepmode: 'backward', count: 5,  label: '5m'    },
		          {step: 'minute',  stepmode: 'backward', count: 15, label: '15m'   },
		          {step: 'minute',  stepmode: 'backward', count: 30, label: '30m'   },
		          {step: 'hour',    stepmode: 'backward', count: 1,  label: '1h'    },
		          {step: 'hour',    stepmode: 'backward', count: 4,  label: '4h'    },
		          {step: 'hour',    stepmode: 'backward', count: 8,  label: '8h'    },
		          {step: 'day',     stepmode: 'backward', count: 1,  label: '1d'    },
		          {step: 'day',     stepmode: 'backward', count: 2,  label: '2d'    },
		          {step: 'day',     stepmode: 'backward', count: 7,  label: '1w'    },
		          {step: 'day',     stepmode: 'backward', count: 14, label: '2w'    },
		          {step: 'month',   stepmode: 'backward', count: 1,  label: '1M'    },
		          {step: 'month',   stepmode: 'backward', count: 6,  label: '6M'    },
		          {step: 'year',    stepmode: 'todate',   count: 1,  label: 'YTD'   },
		          {step: 'year',    stepmode: 'backward', count: 1,  label: '1Y'    },
		          {step: 'minute',  stepmode: 'forward',  count: 7,  label: 'Live'  },
		          ]
};

viewerVars.relativeDateRegex = /^([-+]{0,1})(\d+)([smhdwMQy]{1})$/; // Get these from moment.js Manipulate shorthand.

function parseRelativeDate(relDate) {
    var parts = viewerVars.relativeDateRegex.exec(relDate);
    return (parts[1] != "-") ? moment().add(parseInt(parts[2]), parts[3]).toDate() : moment().subtract(parseInt(parts[2]), parts[3]).toDate();
}

// You can pass in parameters to the viewer.
// You can use pass in any number of pvs using the pv argument, for example, pv=VPIO:IN20:111:VRAW&pv=XCOR:LI21:101:BDES etc.
// We also support start and end times using the from and to arguments; these are date times that work with Date.parse. At least in chrome/firefox, ISO 9601 (eg: 2016-08-29T17:38:16.901Z) seem to work.
// For example, viewerURL?pv=VPIO:IN20:111:VRAW&pv=XCOR:LI21:101:BDES&from=2016-08-29T16:38:16.901&to=2016-08-29T17:38:16.901

// parse parameters into the viweerVars object
function parseURLParameters() {
	queryString = window.location.search;
	if(typeof queryString !== 'undefined' && queryString && queryString.length > 2) {
		queries = queryString.substring(1).split("&");
		for ( i = 0, l = queries.length; i < l; i++ ) {
			var parts = queries[i].split('='), name = parts[0], val =  decodeURIComponent(parts[1]);
			// console.log("Name="+name+"Val="+val);
			switch(name) {
			case "pv":
				viewerVars.pvs.push(val); viewerVars.pvData[val] = {}; break;
			case "from":
                viewerVars.start = viewerVars.relativeDateRegex.test(val) ? parseRelativeDate(val) : new Date(val); break
			case "to":
                viewerVars.end = viewerVars.relativeDateRegex.test(val) ? parseRelativeDate(val) : new Date(val); break
            case "yaxes":
				viewerVars.egu_yaxis_specs = $.parseJSON(decodeURIComponent(val)); break;
            case "binSize":
                viewerVars.binSize = parseInt(val);
                viewerVars.userFixedBinSize = true;
			default:
				console.log("Unsupported parameter " + name); break;
			}
		}
	}
	// QueryStart and QueryEnd are what we actually send to the server....
    determineBinSize();
	viewerVars.queryStart = viewerVars.start;
	viewerVars.queryEnd = viewerVars.end;
}


// Figure out the trace index for each PV that has a trace and return a array of traces in that order.
// Plot.ly thinks of PV's in terms of traces; so we maintain a trace index for each PV that we are showing on the plot.
function computeTraceIndices() {
	var traces = [];
	for(var i = 0; i < viewerVars.pvs.length; i++) {
		pvName = viewerVars.pvs[i];
		if('trace' in viewerVars.pvData[pvName]) {
			var currTraceIndex = traces.length;
			traces.push(viewerVars.pvData[pvName].trace);
			if(!('traceIndex' in viewerVars.pvData[pvName])) {  viewerVars.pvData[pvName].traceIndex = currTraceIndex } ;
		}
	}
	return traces;
}

// Do the layout changes needed to support more than one y-axis. Return a delta layoutChanges object
// When you add more than two axes, we also need to adjust the position of the new axes and the domain of the xaxis.
// To get around a bug in Plotly, when we relayout the x, we will also have to carry over some of the current x axis settings.
function getLayoutChangesForMultipleYAxes(layout) {
	var layoutChanges = {};
	for(var i = 0; i < viewerVars.pvs.length; i++) {
		pvName = viewerVars.pvs[i];
		if(!('axis' in viewerVars.pvData[pvName])) {
			continue;
		}
		var axs = viewerVars.pvData[pvName].axis;
		switch(axs) {
		case 'y1':
			break; // Do nothing for the first y axis...
		default:
			if(!(viewerVars.y_short_2_long[axs] in layout) && !(viewerVars.y_short_2_long[axs] in layoutChanges)) {
				layoutChanges[viewerVars.y_short_2_long[axs]] = _.assign({ title: viewerVars.axis2egu[axs], overlaying: 'y', side: 'right'}, getYAxisSpecification(pvName));
				if(axs in viewerVars.yaxis_layout_changes) {
					layoutChanges[viewerVars.y_short_2_long[axs]].position = viewerVars.yaxis_layout_changes[axs].position;
					if(!('xaxis' in layoutChanges)) { layoutChanges.xaxis = {}; }
					layoutChanges.xaxis.rangeselector = viewerVars.selectorOptions;
					layoutChanges.xaxis.autorange = false;
					layoutChanges.xaxis.range = [viewerVars.start.getTime(), viewerVars.end.getTime()];
					layoutChanges.xaxis.domain = viewerVars.yaxis_layout_changes[axs].domain;
				}
			}
			break;
		}
	}
	return layoutChanges;
}

// Get the range specifier for the y axes
function getYAxisSpecification(pvName) {
    var egu = viewerVars.pvData[pvName].egu;
    return _.get(viewerVars.egu_yaxis_specs, egu, { autorange: true })
}

function getEstimatedRawSamples() {
    var maxSamples = 0;
    for(i = 0; i < viewerVars.pvs.length; i++) {
        pvName = viewerVars.pvs[i];
        maxSamples = Math.max(maxSamples, viewerVars.pvData[pvName].vals.length*viewerVars.binSize);
    }
    return maxSamples;
}


// Enum for the various type of X axis changes; to provide a "smooth" panning experience, we treat that specially.
// All other options are usually delete/replace traces.
var XAxis_Change_Type = {"NewPlot":1, "ReplaceTraces":2, "LeftPan":3, "RightPan":4, "AddNewTrace" : 5};
// Object.freeze(XAxis_Change_Type)

// Compute the bin size for the operators automatically based on the number of points in the plot window and (endTime - startTime).
function determineBinSize() {
	if(viewerVars.userFixedBinSize) {
		return;
	}
	var duration = (viewerVars.end.getTime() - viewerVars.start.getTime())/1000;
	var points = window.innerWidth;
	if(duration <= 2*points) {
		// console.log("No need for any sparsificaiton on the server side");
		viewerVars.binSize = 0;
		return;
	}
	var potentialBinSizes = [5, 10, 15, 30, 60, 120, 180, 300, 600, 1200, 1800, 3600, 7200, 14400, 21600, 43200, 86400];
	for(i in potentialBinSizes) {
		potentialBinSize = potentialBinSizes[i];
		if((duration/potentialBinSize) <= 2*points) {
			viewerVars.binSize = potentialBinSize;
			// console.log("Setting potential bin size to " + viewerVars.binSize + " for windowsize " + points + " and duration " + duration);
			break;
		}
	}
}

// We listen to plotly_relayout events and guess the type of x-axis change based on the presence/absence of elements in the eventdata. Not the most ideal but...
function processChangesOnXAxis(eventdata) {
	console.log( 'Received plotly_relayout event data:' + JSON.stringify(eventdata));
	var previousStart = viewerVars.start;
	var previousEnd = viewerVars.end;
	if (('xaxis.range[0]' in eventdata && 'xaxis.range[1]' in eventdata)
			|| ('xaxis2.range[0]' in eventdata && 'xaxis2.range[1]' in eventdata)
			) {
		if('xaxis.range[0]' in eventdata && 'xaxis.range[1]' in eventdata) {
			viewerVars.start = moment(eventdata['xaxis.range[0]']).toDate();
			viewerVars.end = moment(eventdata['xaxis.range[1]']).toDate();
		} else if('xaxis2.range[0]' in eventdata && 'xaxis2.range[1]' in eventdata) {
			viewerVars.start = moment(eventdata['xaxis2.range[0]']).toDate();
			viewerVars.end = moment(eventdata['xaxis2.range[1]']).toDate();
		}
		var previousDuration = previousEnd.getTime() - previousStart.getTime();
		var duration = viewerVars.end.getTime() - viewerVars.start.getTime();

		if(viewerVars.currentBinningOperator.startsWith('errorbar')) {
			viewerVars.queryStart = viewerVars.start;
			viewerVars.queryEnd = viewerVars.end;
			fetchDataFromServerAndPlot("ReplaceTraces");
			return;
		}
		if (Math.abs(duration - previousDuration) < 10*1000) {
			console.log("Resolution stays the same; use extendTraces/prependTrace");
			if(viewerVars.start < previousStart) {
				// We panned left
				viewerVars.queryStart = viewerVars.start;
				viewerVars.queryEnd = previousStart;
				fetchDataFromServerAndPlot("LeftPan");
			} else {
				// We panned right
				viewerVars.queryStart = previousEnd;
				viewerVars.queryEnd = viewerVars.end;
				fetchDataFromServerAndPlot("RightPan");
			}
		} else {
			console.log("Change in resolution; deleting and replacing traces");
			determineBinSize();
			viewerVars.queryStart = viewerVars.start;
			viewerVars.queryEnd = viewerVars.end;
			fetchDataFromServerAndPlot("ReplaceTraces");
			if(duration == 7*60*1000) {
				console.log("Kicking off live mode..");
				var layoutChanges = {'xaxis' : { 'autorange' : true}};
				layoutChanges.xaxis.rangeselector = viewerVars.selectorOptions;
				layoutChanges.xaxis.domain = myDiv.layout.xaxis.domain;
				Plotly.relayout(myDiv, layoutChanges);
				viewerVars.liveModeTimer = setInterval(liveModeTick, 1*1000);
			} else {
				if(viewerVars.liveModeTimer != null) {
					clearInterval(viewerVars.liveModeTimer);
					viewerVars.liveModeTimer = null;
					var layoutChanges = {'xaxis' : { 'autorange' : false}};
					layoutChanges.xaxis.rangeselector = viewerVars.selectorOptions;
					layoutChanges.xaxis.range = [viewerVars.start.getTime(), viewerVars.end.getTime()];
					layoutChanges.xaxis.domain = myDiv.layout.xaxis.domain;
					Plotly.relayout(myDiv, layoutChanges);
				}
			}
		}
	} else if ('xaxis.range[0]' in eventdata) {
		console.log("We compressed the time scale on the left side");
		viewerVars.start = moment(eventdata['xaxis.range[0]']).toDate();
		viewerVars.queryStart = viewerVars.start;
		viewerVars.queryEnd = previousStart;
		fetchDataFromServerAndPlot("LeftPan");
	}
}

// Get the data from the server and add to the plot. This could be considered the main function in some sense.
// At a high level, we get the data, map the EGU to one of the yaxes and then based on the type of xaxischange call various plotly operations.
function fetchDataFromServerAndPlot(xAxisChangeType, newTracePVNames) {
	if(viewerVars.pvs.length == 0) { return; }

	var pvsToFetchData = (xAxisChangeType == "AddNewTrace") ? newTracePVNames : viewerVars.pvs;
	var pvDataPromises = _.times(pvsToFetchData.length, function() { return new $.Deferred()}), datas = new Array(pvsToFetchData.length);
	_.each(pvsToFetchData, function(pvName, i) {
		var queryString = "";
		if(viewerVars.binSize > 0) {
			if (viewerVars.currentBinningOperator == "raw") {
				queryString = "pv="  + pvName;
			} else {
				queryString = "pv=" + viewerVars.currentBinningOperator + "_" + viewerVars.binSize + "(" + pvName + ")";
			}
		} else {
			queryString = "pv=" + pvName;
		}
		var startEndQs = "&from="+viewerVars.queryStart.toISOString()+"&to="+viewerVars.queryEnd.toISOString();

		if(viewerVars.binSize > 0) {
			var binnedQueryStart = new Date(Math.floor(viewerVars.queryStart.getTime()/(viewerVars.binSize*1000))*viewerVars.binSize*1000);
			console.log("Starting binned data retrieval from " + binnedQueryStart.toISOString());
			startEndQs = "&from="+binnedQueryStart.toISOString()+"&to="+viewerVars.queryEnd.toISOString();
		}
		if (!('DESC' in viewerVars.pvData[pvName])) { startEndQs += "&fetchLatestMetadata=true"}

		var pvDataUrl = viewerVars.serverURL + "/getData.qw?" + queryString + startEndQs;
		console.log(pvDataUrl);
		$.getJSON(pvDataUrl).done(function(d0){datas[i] = d0; pvDataPromises[i].resolve(true)}).fail(function(jqXHR, textStatus, errorThrown){console.log("Server side failure getting data for " + pvName + "\n" + jqXHR.responseText); datas[i] = {}; pvDataPromises[i].resolve(false)});
	})

	$.when.apply($, pvDataPromises).done(function () {
		// The done is called with the results of the .getJSON's for all the submitted URLs. Use the Javascript arguments object to unpack the data.
		for(let i = 0, l = arguments.length; i < l; i++) {
            if(!arguments[i]) {
                new Noty({type: "error", timeout: 5000, text: "Failure getting data for PV " + pvsToFetchData[i]}).show();
				continue;
			}
			let data = datas[i][0];
			if(_.isNil(data) || !_.includes(_.keys(data), "meta")) { console.log("Empty dataset for PV at" + i); console.log(data); continue}
			// arguments[i] is the result of the .getJSON; the data is in [0]. The server sends this as an array hence the additional [0]
			var pvName = data['meta'].name;
			console.log("Plotting " + pvName);
			var egu = data['meta']['EGU'];
			if(typeof egu == 'undefined' || !egu || egu.length <= 0) { egu = 'N/A'; }
			if(!('egu' in viewerVars.pvData[pvName])) {
				viewerVars.pvData[pvName].egu = egu;
				if (egu in viewerVars.egu2axis) {
					viewerVars.pvData[pvName].axis = viewerVars.egu2axis[egu];
				} else {
					for(j = 0; j < viewerVars.supportedYAxes.length; j++) {
						if(!(viewerVars.supportedYAxes[j] in viewerVars.axis2egu)) {
							console.log("Mapping " + egu + " to " + viewerVars.supportedYAxes[j]);
							viewerVars.egu2axis[egu] = viewerVars.supportedYAxes[j];
							viewerVars.axis2egu[viewerVars.supportedYAxes[j]] = egu;
							viewerVars.pvData[pvName].axis = viewerVars.egu2axis[egu];
							break;
						}
					}
				}
				if(!('axis' in viewerVars.pvData[pvName])) {
                    new Noty({type: "error", timeout: 5000, text: "Cannot map " + pvName + " to one of the available axes. Not displaying this PV."}).show();
					continue;
				}
			}
			if('DESC' in data['meta']) {
				viewerVars.pvData[pvName]['DESC'] = data['meta']['DESC'];
			}

			if(!('axis' in viewerVars.pvData[pvName])) {
				continue;
			}
			var isWaveform = data['meta']['waveform'];
			if(isWaveform) { // Escape hatch for waveforms...
				if(viewerVars.pvs.length > 1) {
					alert("For now, you can only plot one waveform at a time");
					return;
				}
				return process3DPlot(pvName, data);
			}

			// var XAxis_Change_Type = {"NewPlot":1, "ReplaceTraces":2, "LeftPan":3, "RightPan":4};
			switch(xAxisChangeType) {
			case "LeftPan":
				var previousDataSetFirstSampleMillis = myDiv.data[viewerVars.pvData[pvName].traceIndex].x[0].getTime();
				console.log(data['data'].length + " samples from the server " + myDiv.data[viewerVars.pvData[pvName].traceIndex].x[0].toString());

				var secs = data['data'].filter(function(sample){ return (sample['millis']) < previousDataSetFirstSampleMillis; }).map(function(sample) { return new Date(sample['millis']); });
				var vals = data['data'].filter(function(sample){ return (sample['millis']) < previousDataSetFirstSampleMillis; }).map(function(sample) { return sample['val']; });
				viewerVars.pvData[pvName].update = { x: secs, y: vals };
				console.log(secs.length + " after processing");
				break;
			case "RightPan":
				var previousDataSetLastSampleMillis = myDiv.data[viewerVars.pvData[pvName].traceIndex].x.slice(-1)[0].getTime();
				var secs = data['data'].filter(function(sample){ return (sample['millis']) > previousDataSetLastSampleMillis; }).map(function(sample) { return new Date(sample['millis']); });
				var vals = data['data'].filter(function(sample){ return (sample['millis']) > previousDataSetLastSampleMillis; }).map(function(sample) { return sample['val']; });
				viewerVars.pvData[pvName].update = { x: secs, y: vals };
				break;
			case "ReplaceTraces":
			case "NewPlot":
			case "AddNewTrace":
			default:
				viewerVars.pvData[pvName].secs = data['data'].map(function(sample) { return new Date(sample['millis']); });
			    viewerVars.pvData[pvName].vals = data['data'].map(function(sample) { return sample['val']; });
                console.log("Add a fake point at " + moment(viewerVars.queryEnd).toDate());
                viewerVars.pvData[pvName].secs.push(moment(viewerVars.queryEnd).toDate()); viewerVars.pvData[pvName].vals.push(viewerVars.pvData[pvName].vals.slice(-1)[0]);
			    viewerVars.pvData[pvName].trace = {
					x: viewerVars.pvData[pvName].secs,
					y: viewerVars.pvData[pvName].vals,
					name: pvName,
					type: 'scatter',
					mode: "lines",
					line: {shape: 'hv'},
					yaxis: viewerVars.pvData[pvName].axis
			    };
			    if (viewerVars.binSize > 0 && viewerVars.currentBinningOperator.startsWith('errorbar')) {
			    	viewerVars.pvData[pvName].stdzVals = data['data'].map(function(sample) { return sample['fields']['stdz']; });
			    	viewerVars.pvData[pvName].trace.error_y = {type: 'data', array: viewerVars.pvData[pvName].stdzVals, visible: true};
			    }

			    break;
			} // Close the switch
		}

		if(!('layout' in myDiv)) { // This means we are creating the plotly object for the first time...
			var layout = {
					title: 'EPICS Archiver Appliance Viewer',
                    width: window.innerWidth,
					height: window.innerHeight*0.95,
					showlegend: true,
					legend: {x: 0, y: 1},
					xaxis: {type: 'date', rangeselector: viewerVars.selectorOptions,
						autorange: false, range: [viewerVars.start.getTime(), viewerVars.end.getTime()],
						title: getXAxisTitle(),
						titlefont: {color: '#7f7f7f', }
					},
					yaxis: _.assign({title: viewerVars.axis2egu['y1'], exponentformat: 'e'}, getYAxisSpecification(viewerVars.pvs[0]))
			};
			var layoutChanges = getLayoutChangesForMultipleYAxes(layout);
			$.extend(true, layout, layoutChanges);

			var traces = computeTraceIndices();
			viewerVars.plotType = viewerVars.plotTypeEnum.SCATTER_2D;
			var plotConfig = generatePlotConfig();
			Plotly.newPlot('archViewer', traces, layout, plotConfig).then(function() {
				myDiv.on('plotly_relayout', processChangesOnXAxis);
				addToolTipsToTraceLegends();
			});
		} else { // We have already created the plotly object; use add/delete API's
			var updateXs = [], updateYs = [], updateIndices = [], newTraces = [], newTraceIndices = [];
			for(i = 0; i < viewerVars.pvs.length; i++) {
				pvName = viewerVars.pvs[i];
				// Skip PV's that have not been mapped to an axis
				if(!('axis' in viewerVars.pvData[pvName])) continue;

				if('update' in viewerVars.pvData[pvName]) {
					updateXs.push(viewerVars.pvData[pvName].update.x);
					updateYs.push(viewerVars.pvData[pvName].update.y);
					updateIndices.push(viewerVars.pvData[pvName].traceIndex);
				}

				newTraces.push(viewerVars.pvData[pvName].trace);
				newTraceIndices.push(viewerVars.pvData[pvName].traceIndex);
			}
			switch(xAxisChangeType) {
			case "LeftPan":
				console.log("Left panning " + updateIndices);
				Plotly.prependTraces(myDiv, {x: updateXs, y: updateYs}, updateIndices);
				break;
			case "RightPan":
				console.log("Right panning " + updateIndices);
				Plotly.extendTraces(myDiv, {x: updateXs, y: updateYs}, updateIndices);
				break;
			case "ReplaceTraces":
				console.log("Replacing traces " + newTraceIndices);
				updateXAxisTitle();
				Plotly.deleteTraces(myDiv, newTraceIndices);
				Plotly.addTraces(myDiv, newTraces).then(function() { reflectBinSizeColorOnLegend(); addToolTipsToTraceLegends(); });
				break;
			case "AddNewTrace":
				var traces = computeTraceIndices();
				for(var j = 0; j < newTracePVNames.length; j++) {
					pvName = newTracePVNames[j];
					if(!('trace' in viewerVars.pvData[pvName])) continue;
					console.log("Checking to see if we need to add axis for " + pvName + " at " + viewerVars.pvData[pvName].traceIndex);
					// Add the new axis if it does not exist in the layout already.
					var longAxisName = viewerVars.y_short_2_long[viewerVars.pvData[pvName].axis];
					if(!(longAxisName in myDiv.layout)) {
						var layoutChanges = getLayoutChangesForMultipleYAxes(myDiv.layout);
						Plotly.relayout(myDiv, layoutChanges)
							.then(Plotly.addTraces(myDiv, viewerVars.pvData[pvName].trace, viewerVars.pvData[pvName].traceIndex))
							.then(addToolTipsToTraceLegends());
					} else {
						Plotly.addTraces(myDiv, viewerVars.pvData[pvName].trace, viewerVars.pvData[pvName].traceIndex)
						.then(addToolTipsToTraceLegends);
					}
				}
				break;
			case "NewPlot":
				alert("Should not be here....");
				break;
			default:
				alert("Should not be here....");
				break;
			}
		}
	}).fail(function() { console.log("Failed to get data from the server"); });;
}

// The modebar is specified in the plotConfig. Use icons from font-awesome to create our modebar buttons.
function generatePlotConfig() {
	var newModeBarButtons = [];
	newModeBarButtons.push({ name: 'Start/End',
		icon: viewerVars.icons['regular/calendar-alt'],
		click: function() {
			$("#dialog_startTime").val(moment(viewerVars.start).format("YYYY/MM/DD HH:mm:ss"));
			$("#dialog_endTime").val(moment(viewerVars.end).format("YYYY/MM/DD HH:mm:ss"));
			$('#startEndTimeModal').modal('show');
		}});
	if(viewerVars.plotType == viewerVars.plotTypeEnum.SCATTER_2D) {
		newModeBarButtons.push({ name: 'Add PVs',
			icon: viewerVars.icons['solid/search'],
			click: function() { $('#searchAndAddPVsModal').modal('show'); }
		});
	}
	newModeBarButtons.push({ name: 'Show Data',
		icon: viewerVars.icons['solid/save'],
		click: showChartDataAsText
	});
	newModeBarButtons.push({ name: 'Export as CSV',
		icon: viewerVars.icons['solid/download'],
		click: exportToCSV
	});
	newModeBarButtons.push({ name: 'Link to current',
		icon: viewerVars.icons['solid/link'],
		click: showLinkToCurrentView
	});
    if(viewerVars.siteSupportsPostToElog) {
        newModeBarButtons.push({ name: 'Post to elog',
    		icon: viewerVars.icons['solid/share'],
    		click: showElogModal
    	});
    }
    newModeBarButtons.push({ name: 'Y Axes ranges',
		icon: viewerVars.icons['solid/text-height'],
		click: showYAxesRangeModal
	});
    newModeBarButtons.push({ name: 'Remove PVs',
		icon: viewerVars.icons['solid/trash-alt'],
		click: showRemovePVsModal
	});
	newModeBarButtons.push({ name: 'Help',
		icon: viewerVars.icons['regular/question-circle'],
		click: showHelp
	});


	// Add mode bar buttons for start+end time etc
	var plotConfig = {
			displaylogo: false,
			modeBarButtonsToAdd: newModeBarButtons,
			modeBarButtonsToRemove: ['sendDataToCloud']
	};
	return plotConfig;
}

// The search modebar buttons will eventually call this function to add a new PV to the plot.
function addTraceForNewPVs(pvNames) {
	var addingForTheFirstTime = (viewerVars.pvs.length == 0);
	viewerVars.pvs = viewerVars.pvs.concat(pvNames);
	pvNames.forEach(function(nm,i) { viewerVars.pvData[nm] = {}; });
	console.log("Adding " + pvNames + " to traces");
	if(addingForTheFirstTime) {
		fetchDataFromServerAndPlot("NewPlot");
	} else {
		fetchDataFromServerAndPlot("AddNewTrace", pvNames);
	}
}

// Main function for plotting waveforms. We launch a timer that shows each sample in the waveform as a scatter plot.
function process3DPlot(pvName, data) {
	viewerVars.pvData[pvName].secs = data['data'].map(function(sample) { return new Date(sample['millis']); });
	viewerVars.pvData[pvName].vals = data['data'].map(function(sample) { return sample['val']; });
	if(viewerVars.pvData[pvName].vals.length <= 0) { return; }

	if(viewerVars.currentlyAnimating3DPlot) {
		viewerVars.currentlyAnimating3DPlot = false;
		clearInterval(viewerVars.timerIndexFor3DAnimation);
		// console.log("Stopped existing timer");
	}

	viewerVars.currentlyAnimating3DPlot = true;
	viewerVars.timerIndexFor3DAnimation = setInterval(frame, 1000);
	var totalFrames = viewerVars.pvData[pvName].secs.length;
	var currentFrame = 0;

	function moveToFrame(frameTimeStr) { // Process use clicks on the time plot to move to a particular point.
		var frameTime = moment(frameTimeStr).toDate();
		for(i = 0; i < totalFrames; i++) {
			if(viewerVars.pvData[pvName].secs[i].getTime() == frameTime.getTime()) {
				// console.log("Moving to frame " + currentFrame);
				currentFrame = i;
				frame();
				break;
			}
		}
	}

	function cancel() {
		viewerVars.currentlyAnimating3DPlot = false;
		clearInterval(viewerVars.timerIndexFor3DAnimation);
		myDiv.on('plotly_click', function(data) { if(data.points[0].data.name == 'Time') { moveToFrame(data.points[0].x); }});
	}

	function frame() {
		// Perform animation for each frame.
		function range(len) { var ret = []; for(var i = 0; i < len; i++) { ret.push(i); } return ret; }
		function spikeCurrentFrame() { var ret = []; for(var i = 0; i < totalFrames; i++) { ret.push((i == currentFrame) ? 4 : 1); } return ret; }
        function getTimestampStrings() { var ret = []; for(var i = 0; i < viewerVars.pvData[pvName].secs.length; i++) { ret.push(moment(viewerVars.pvData[pvName].secs[i]).format("MMM/D/YYYY HH:mm:ss.SSS")); } return ret; }

		var valueTrace = {
				x: range(viewerVars.pvData[pvName].vals[currentFrame].length),
				y: viewerVars.pvData[pvName].vals[currentFrame],
				name: pvName,
				type: 'scatter',
				yaxis: 'y1'
		};
		var timeTrace = {
				x: viewerVars.pvData[pvName].secs,
				y: spikeCurrentFrame(),
				name: "Time",
				type: 'scatter',
				xaxis: 'x2',
				yaxis: 'y2',
                hovertext: getTimestampStrings(),
				mode: "markers",
				marker: { size: 5 }
		};

		if('layout' in myDiv) { // Plotly object already exists.
			Plotly.deleteTraces(myDiv, [0,1])
			.then(function() {
				Plotly.addTraces(myDiv, [valueTrace, timeTrace]);
			});
		} else { // Plotly object does not exist.
			viewerVars.plotType = viewerVars.plotTypeEnum.ANIMATE_3D;
			var layout = {
					title: 'EPICS Archiver Appliance Viewer',
					height: window.innerHeight*0.95,
					showlegend: true,
					legend: {x: 0, y: 1},
					xaxis: {type: 'linear', autorange: true},
					yaxis: {autorange: true, domain: [0, 0.8]},
					xaxis2: {type: 'date', rangeselector: viewerVars.selectorOptions, autorange: false, range: [viewerVars.start.getTime(), viewerVars.end.getTime()], anchor: 'y2'},
					yaxis2: {autorange: false, range: [0, 10], domain: [0.8, 1.0], anchor: 'x2'},
			};

			var plotConfig = generatePlotConfig();
			Plotly.newPlot('archViewer', [valueTrace, timeTrace], layout, plotConfig)
			.then(function() {
				myDiv.on('plotly_relayout', processChangesOnXAxis);
			});
		}


		currentFrame = (currentFrame + 1 ) % totalFrames;
		if(currentFrame == 0) {
			cancel();
		}
	}
}

// get the X-Axis title string based on the bin size and the current operator.
function getXAxisTitle() {
	if(viewerVars.binSize <= 0 || viewerVars.currentBinningOperator == "raw") {
		return "<span>" + "Raw Data" + "</span><span>[" + 0 + "(s)]</span>";
	} else {
		return "<span>" + viewerVars.currentBinningOperator + "</span><span>[" + viewerVars.binSize + "(s)]</span>";
	}
}

// Update the X-Axis title based on changes to bin size and post-processor.
function updateXAxisTitle() {
	myDiv.layout.xaxis.title = getXAxisTitle();
}

// If the PV has a .DESC, we add that as a tooltip to the PV's legend.
function addToolTipsToTraceLegends() {
	$("g.legend g.traces").each(function() {
		var pvName = $( this ).children('.legendtext').attr('data-unformatted');
        var ttipText = _.get(viewerVars.pvData[pvName], 'DESC', '') + "  -  (" + _.get(viewerVars.pvData[pvName], 'egu', 'N/A') + ")";
		var ttip = document.createElementNS("http://www.w3.org/2000/svg", 'title');
		ttip.appendChild(document.createTextNode(ttipText));
		$( this )[0].appendChild(ttip);
	});
}

// We show fixed bin sizes in a different color; dynamic bin sizes are neutral.
function reflectBinSizeColorOnLegend() {
	if(viewerVars.userFixedBinSize) {
		$(".xtitle").addClass("fixedBinSize");
	} else {
		$(".xtitle").removeClass("fixedBinSize");
	}
}


// Done with plotly integration.
// Functions for the page start here.

function liveModeTick() { // Timer function for the live mode tick...
	var now = new Date();
	viewerVars.end = now;
	viewerVars.start = new Date(now.getTime() - 7*60*1000);
	viewerVars.queryStart = viewerVars.start;
	viewerVars.queryEnd = viewerVars.end;
	fetchDataFromServerAndPlot("RightPan");
}


// User selected a start and end time...
function startAndEndTimeSelected() {
	viewerVars.start = moment($("#dialog_startTime").val(), "YYYY/MM/DD HH:mm:ss").toDate();
	viewerVars.end   = moment($("#dialog_endTime").val(), "YYYY/MM/DD HH:mm:ss").toDate();
	viewerVars.queryStart = viewerVars.start;
	viewerVars.queryEnd = viewerVars.end;

	if(viewerVars.plotType == viewerVars.plotTypeEnum.SCATTER_2D) {
		var currXAxis = myDiv.layout.xaxis;
		layoutChanges = {'xaxis': { 'autorange' : false }};
		layoutChanges.xaxis.rangeselector = viewerVars.selectorOptions;
		layoutChanges.xaxis.range = [viewerVars.start.getTime(), viewerVars.end.getTime()];
		layoutChanges.xaxis.domain = currXAxis.domain;
		Plotly.relayout(myDiv, layoutChanges);
	} else {
		var currXAxis = myDiv.layout.xaxis2;
		layoutChanges = {'xaxis2': { 'autorange' : false }};
		layoutChanges.xaxis2.rangeselector = viewerVars.selectorOptions;
		layoutChanges.xaxis2.range = [viewerVars.start.getTime(), viewerVars.end.getTime()];
		layoutChanges.xaxis2.domain = currXAxis.domain;
		layoutChanges.xaxis2.anchor = 'y2';
		Plotly.relayout(myDiv, layoutChanges);
	}

	console.log("Fetching data from " + viewerVars.start + " to " + viewerVars.end );
	fetchDataFromServerAndPlot("ReplaceTraces");
}

// User typed a pattern, we search for PV's matching this pattern.
function searchForPVsMatchingPattern() {
	var pattern = $("#pvNamePattern").val();
	console.log("Search and add PVs for pattern " + pattern);
	var list = $("#pvNameSearchMatchingList");
	list.empty();
	$("#pvNameSearchMatchingError").empty();
	$.getJSON( viewerVars.serverURL + "/../bpl/getMatchingPVs?limit=10000&pv=" + pattern, function(matchingPVs){
		if(matchingPVs.length > 1) {
			matchingPVs.forEach(function(matchingPV) { list.append('<li class="list-group-item">' + matchingPV + '</li>') });
			$("#pvNameSearchMatchingList li").click(function() { $(this).toggleClass('list-group-item-info'); });
		} else if(matchingPVs.length == 1) {
            $('#searchAndAddPVsModal').modal('hide');
            addTraceForNewPVs(matchingPVs);
            return;
        } else {
			$("#pvNameSearchMatchingError").html("No PV names matched your search. Search using GLOB patterns, for example, QUAD:*:BDES");
		}
	});
}

function addSelectedSearchPVs(e) {
	var selectedPVs = [];
	$("#pvNameSearchMatchingList li.list-group-item-info").each(function(index) { selectedPVs.push($(this).text())});
	if(selectedPVs.length > 0) {
        $('#searchAndAddPVsModal').modal('hide');
        addTraceForNewPVs(selectedPVs);
        return true;
    }
    return false;
}

function fixBinSize() {
	var binSize = parseInt($("#binSizeInput").val());
	if(binSize > 0) {
		viewerVars.userFixedBinSize = true;
		viewerVars.binSize = binSize;
		viewerVars.queryStart = viewerVars.start;
		viewerVars.queryEnd = viewerVars.end;
		fetchDataFromServerAndPlot("ReplaceTraces");
	}
}

// When you click on a y-axis, toggle between a log/linear scale.
function toggleLinearLogScale(egu) {
	var shortAxis = viewerVars.egu2axis[egu];
	var longAxis = viewerVars.y_short_2_long[shortAxis];
	var currentType = myDiv.layout[longAxis]['type'];
	var newType = (currentType == "linear") ? "log" : "linear";
	var newTitle = (newType == "linear") ? egu : ("log(" + egu + ")");
	console.log("Changing scale for " + egu + " to " + newType);
	myDiv.layout[longAxis]['type'] = newType;
	myDiv.layout[longAxis]['title'] = newTitle;
	Plotly.redraw(myDiv);
}

// This returns the data used for the chart as a tuple
// The returned tuple has an 1) array of PV names and 2) a dict of time => [array of values]
// Use the array of PV names as the column headers
// Use the time => [array of values] as rows in a table.
function getCurrentDataAsDict() {
	function naArray(len) {
		var ret = [];
		for(var i in len) { ret.push("N/A"); }
		return ret;
	}

	var tbl = {}
	var names = [];
	if(viewerVars.plotType == viewerVars.plotTypeEnum.SCATTER_2D) {
		for(i in myDiv.data) {
			var data = myDiv.data[i];
			var dlen = data.x.length;
			names.push(data.name);
			for(j = 0; j < dlen; j++) {
				var t = new Date(data.x[j]).toISOString();
				if(!(t in tbl)) { tbl[t] =  naArray(myDiv.data); }
				tbl[t][i] = data.y[j];
			}
		}
		return [names, tbl];
	} else {
		names.push(viewerVars.pvs[0]); // We only support one waveform for now...
		var maxColumnNum = 0;
		var numSamples = viewerVars.pvData[pvName].secs.length;
		for(var j = 0; j < numSamples; j++) {
			var t = new Date(viewerVars.pvData[pvName].secs[j]).toISOString();
			var val = viewerVars.pvData[pvName].vals[j];
			if(val.length > maxColumnNum) { maxColumnNum = val.length; }
			if(!(t in tbl)) { tbl[t] =  naArray(val.length); }
			for(var k = 0; k < val.length; k++) {
				tbl[t][k] = val[k];
			}
		}
		for(var n = 1; n < maxColumnNum; n++) { names.push(n); }
		return [names, tbl];
	}
}

// Popup a modal with the data for the current plot.
function showChartDataAsText() {
	var d = getCurrentDataAsDict();
	var names = d[0];
	var tbl = d[1];
	var htmlContent = "<table id='showDataTable' class='table table-striped table-bordered table-condensed'><tr><th>Time</th><th>" + names.join("</th><th>") + "</th></tr>\n";
	Object.keys(tbl).sort().forEach(function(key) { htmlContent += "<tr><td>" + moment(key).format("YYYY/MM/DD HH:mm:ss.SSS") + "</td><td>" + tbl[key].join("</td><td>") + "</td></tr>\n"; });
	$("#showDataTableDiv").empty();
	$("#showDataTableDiv").append(htmlContent);
	$('#showDataModal').modal('show');
}

function exportToCSV() {
	var d = getCurrentDataAsDict();
	var names = d[0];
	var tbl = d[1];
	var csvContent = "Timestamp," + names.join(",") + "\n";
	Object.keys(tbl).sort().forEach(function(key) { csvContent +=  moment(key).format("YYYY/MM/DD HH:mm:ss.SSS,") + tbl[key].join(",") + "\n"; });
	myWindow = window.open("data:text/csv;charset=utf-8," + encodeURIComponent(csvContent));
}

function getLinkToCurrentView() {
    var linkToCurrentView = window.location.href.split('?')[0] + '?';
	var first = true;
	for(var i in viewerVars.pvs) {
		var pvName = viewerVars.pvs[i];
		if(first) { first = false; } else { linkToCurrentView += "&"; }
		linkToCurrentView += "pv=" + pvName;
	}
	linkToCurrentView += "&from=" + viewerVars.start.toISOString();
	linkToCurrentView += "&to="   + viewerVars.end.toISOString();
    if(viewerVars.userFixedBinSize) { linkToCurrentView += "&binSize="   + viewerVars.binSize; }
    if(!_.isEmpty(viewerVars.egu_yaxis_specs)) {  linkToCurrentView += "&yaxes=" + encodeURIComponent(JSON.stringify(viewerVars.egu_yaxis_specs)); }
    return linkToCurrentView;
}

// URL to what we are currently showing...
function showLinkToCurrentView() {
    var linkToCurrentView = getLinkToCurrentView();
	console.log(linkToCurrentView);
	$("#linkText").val(linkToCurrentView);
	$('#linkModal').modal('show');
}

function showHelp() {
	console.log("Need to show help here");
}

function allowDrop(ev) {
    ev.preventDefault();
}

function drop(ev) {
    ev.preventDefault();
    var pvName = ev.dataTransfer.getData("text").trim();
    if(typeof pvName !== 'undefined' && pvName && pvName.length > 2) {
        console.log("Dropping in pv " + pvName);
    	addTraceForNewPVs([pvName]);
    }
}

function showElogModal(gd) {
    if(gd._snapshotInProgress) { alert('Already posting to the elog'); return; }
    function makeblob(dataURL) { // from https://stackoverflow.com/questions/34047648/how-to-post-an-image-in-base64-encoding-via-ajax/34064793
        var BASE64_MARKER = ';base64,';
        if (dataURL.indexOf(BASE64_MARKER) == -1) {
            var parts = dataURL.split(','), contentType = parts[0].split(':')[1], raw = decodeURIComponent(parts[1]);
            return new Blob([raw], { type: contentType });
        }
        var parts = dataURL.split(BASE64_MARKER), contentType = parts[0].split(':')[1], raw = window.atob(parts[1]), rawLength = raw.length, uInt8Array = new Uint8Array(rawLength);
        for (var i = 0; i < rawLength; ++i) { uInt8Array[i] = raw.charCodeAt(i); }
        return new Blob([uInt8Array], { type: contentType });
    }
    gd._snapshotInProgress = true;
    var promise = Plotly.toImage(gd, {'format': 'png'})
      .then(function(result) {
          gd._snapshotInProgress = false;
          viewerVars.currentSnapshot = makeblob(result);
          console.log("Done generating snapshot and storing in viewervars");
          $("#elogComment").val("");
          $('#elogModal').modal('show');
      })
      .catch(function() {
          gd._snapshotInProgress = false;
          viewerVars.currentSnapshot = null;
          alert("There was a problem creating a snapshot");
      });}

function postToELog() {
    if(viewerVars.currentSnapshot == null) { return; }
    var data = new FormData();
    data.append("snapshot", viewerVars.currentSnapshot);
    data.append("comment", $("#elogComment").val());
    data.append("link", getLinkToCurrentView());
    $.ajax({
        url: viewerVars.postToElogURL,
        cache: false, contentType: false, processData: false,
        method: 'POST',
        data: data
       })
   .done(function(data) { console.log("Successfully posted to the elog"); })
   .fail(function(jqXHR, textStatus, errorThrown) { alert("Error posting to the elog " + jqXHR.statusText); console.log(jqXHR);})
   .always(function(){ viewerVars.currentSnapshot = null; })
}

function showYAxesRangeModal() {
    var axtmpl = `{{#.}}<tr><td><label>{{egu}}</label></td><td><input type="text" class="form-control" name="{{egu}}_min" value="{{min}}"/></td><td><input type="text" class="form-control" name="{{egu}}_max" value="{{max}}"/></td></tr>{{/.}}`;
    Mustache.parse(axtmpl);
    var yranges = _.map(viewerVars.egu2axis, function(v, k) { return {
        "egu": k,
        "min": _.get(viewerVars.egu_yaxis_specs, k + ".range[0]", _.get(myDiv._fullLayout, viewerVars.y_short_2_long[v] + '.range[0]', -10)),
        "max": _.get(viewerVars.egu_yaxis_specs, k + ".range[1]", _.get(myDiv._fullLayout, viewerVars.y_short_2_long[v] + '.range[1]',  10))
    }})
    $("#yAxesModal").find("table tbody").empty().append(Mustache.render(axtmpl, yranges));
    $('#yAxesModal').modal('show');
}

function applyYAxesRanges() {
    var newlayout = myDiv.layout;
    _.each(viewerVars.egu2axis, function(v, k) {
        if(k == 'N/A') { k = $.escapeSelector(k); }
        var range = [parseFloat($("#yAxesModal").find("table tbody").find("input[name="+k+"_min]").val()), parseFloat($("#yAxesModal").find("table tbody").find("input[name="+k+"_max]").val())];
        _.set(viewerVars.egu_yaxis_specs, k + '.range', range);
        _.set(newlayout, viewerVars.y_short_2_long[v] + ".autorange", false);
        _.set(newlayout, viewerVars.y_short_2_long[v] + ".range", range);
    });
    fetchDataFromServerAndPlot("ReplaceTraces");
}

function showRemovePVsModal() {
    if(viewerVars.pvs.length <= 0) { return; }
    var rmtmpl = `{{#pvNames}}<div class="checkbox"><label><input type="checkbox" value="{{.}}">{{.}}</label></div>{{/pvNames}}`;
    Mustache.parse(rmtmpl);
    $("#removePVsModal").find(".checkboxlist").empty().append(Mustache.render(rmtmpl, { pvNames: viewerVars.pvs }));
    $('#removePVsModal').modal('show');
}

function removePVFromPlot(pvName) {
    console.log("Removing " + pvName);
    var index = _.indexOf(viewerVars.pvs, pvName);
    if (index >= 0) {
        viewerVars.pvs.splice(index, 1);
        delete viewerVars.pvData[pvName];
        Plotly.deleteTraces(myDiv, index);
    }
}

function removeSelectedPVs() {
    $("#removePVsModal").find(".checkboxlist").find("input:checked").each(function(){
        removePVFromPlot($(this).val());
    });
}

$(document).ready( function() {
    $.getJSON("lib/fapaths.json").done(function(icons){
        viewerVars.icons = icons;
        parseURLParameters();
    	if(viewerVars.pvs.length == 0) {
    		$('#searchAndAddPVsModal').modal('show');
    	} else {
    		fetchDataFromServerAndPlot("NewPlot");
    	}
    })

    $(document).on("paste", function(ev) {
        var pvName = ev.originalEvent.clipboardData.getData('text/plain').trim();
        if(typeof pvName !== 'undefined' && pvName && pvName.length > 2) {
            console.log("Pasting PV from clipboard event " + pvName);
            addTraceForNewPVs([ev.originalEvent.clipboardData.getData('text/plain').trim()]);
        }
    });


	// There is a big SVG drag area over much of the plot; so we do this to determine if the user has clicked on some plot element.
	$(document).click(function(e) {
		for(var shortName in viewerVars.axis2egu) { // Check to see if the user clicked on one of the y-axes
			var axisObj = $("." + viewerVars.y_short_2_axisclass[shortName])[0];
			if (typeof axisObj == 'undefined') continue;
			var bRect = axisObj.getBoundingClientRect();
			if(e.pageX >= bRect.left && e.pageX <= bRect.right && e.pageY >= bRect.top && e.pageY <= bRect.bottom) {
				console.log("Axis " + viewerVars.axis2egu[shortName] + " clicked");
				toggleLinearLogScale(viewerVars.axis2egu[shortName]);
				return;
			}
		}

		var xaxisDom = $(".xtitle")[0];
		if(typeof xaxisDom !== 'undefined') { // Check to see if the user clicked on one of the x-axis components
			var bRect = xaxisDom.getBoundingClientRect();
			var leftOffset = bRect.left + window.scrollX, topOffset = bRect.top + window.scrollY;
			if(e.pageX >= leftOffset && e.pageX <= (leftOffset + bRect.width) && e.pageY >= topOffset && e.pageY <= (topOffset + bRect.height)) { // console.log("We are within the X-Axis label now");
				try {
					var ppl = xaxisDom.children[0].getBBox().x; var bnl = ppl + xaxisDom.children[0].getComputedTextLength();
				} catch(e) {
					var ppl = xaxisDom.children[0].getBoundingClientRect().left + window.scrollX; var bnl = ppl + xaxisDom.children[0].getComputedTextLength();
				}
				if(e.pageX >= ppl && e.pageX <= bnl ) {
					// Toggle between the various operators; note that this is a global operation for now and applies to all PV's
					var nextBinningOperator = viewerVars.binningOperatorsList[((viewerVars.binningOperatorsList.indexOf(viewerVars.currentBinningOperator)+1)%viewerVars.binningOperatorsList.length)];
					if(nextBinningOperator == "raw" && getEstimatedRawSamples() > 1000000) {
						console.log("Skip switching into the raw operator as we estimate to have more than 1000000 samples for one of the PV's");
						nextBinningOperator = viewerVars.binningOperatorsList[((viewerVars.binningOperatorsList.indexOf(nextBinningOperator)+1)%viewerVars.binningOperatorsList.length)];
					}
					viewerVars.currentBinningOperator = nextBinningOperator;
					fetchDataFromServerAndPlot("ReplaceTraces");
				} else {
					// We assume that the viewer will always prefer raw mode; so turn off the operator selection is bin size is 0.
					if(viewerVars.binSize > 0) {
						if(viewerVars.userFixedBinSize) {
							viewerVars.userFixedBinSize = false;
							reflectBinSizeColorOnLegend();
						} else {
							$('#binSizeModal').modal('show');
						}
					}
				}
				return;
			}
		}
	});
});
