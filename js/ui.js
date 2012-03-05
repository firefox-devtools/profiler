const hiliteClassName = "histogramHilite";

function removeAllChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function treeObjSort(a, b) {
  return b.counter - a.counter;
}

function TreeFeeder(container) {
  this.treeView = new TreeView(container);
  var self = this;
  this.treeView.addEventListener("select", function (frameData) {
    self.highlightFrame(frameData);
  });
}
TreeFeeder.prototype = {
  highlightFrame: function TreeRender_highlightFrame(frameData) {
    var selectedCallstack = [];
    var curr = frameData;
    while (curr != null) {
      if (curr.name != null) {
        selectedCallstack.push(curr.fullFrameNameAsInSample);
      }
      curr = curr.parent;
    }
    setHighlightedCallstack(selectedCallstack.reverse());
  },
  render: function TreeFeeder_render(tree) {
    this.treeView.display(this.convertToJSTreeData(tree));
  }
  convertToJSTreeData: function TreeFeeder__convertToJSTreeData(tree) {
    var roots = [];
    var object = {};
    function childVisitor(node, curObj) {
      curObj.counter = node.counter;
      var selfCounter = node.counter;
      for (var i = 0; i < node.children.length; ++i) {
        selfCounter -= node.children[i].counter;
      }
      curObj.selfCounter = selfCounter;
      curObj.ratio = node.counter / node.totalSamples;
      curObj.fullFrameNameAsInSample = node.name;
      var functionAndLibrary = node.name.split(" (in ");
      if (functionAndLibrary.length == 2) {
        curObj.name = functionAndLibrary[0];
        curObj.library = functionAndLibrary[1].substr(0, functionAndLibrary[1].length - 1);
      } else {
        curObj.name = node.name;
        curObj.library = "";
      }
      if (node.children.length) {
        curObj.children = [];
        for (var i = 0; i < node.children.length; ++i) {
          var child = node.children[i];
          var newObj = {};
          childVisitor(child, newObj);
          newObj.parent = curObj;
          curObj.children.push(newObj);
        }
        curObj.children.sort(treeObjSort);
        curObj.children = curObj.children.splice(0, 20);
      }
    }
    childVisitor(tree, object);
    roots.push(object);
    roots.sort(treeObjSort);
    return {data: roots};
  },
};

function HistogramRenderer() {}
HistogramRenderer.prototype = {
  render: function HistogramRenderer_render(data, container, highlightedCallstack,
                                            markerContainer) {
    function convertToHistogramData(data) {
      function isSampleSelected(step) {
        if (step.frames.length < highlightedCallstack.length || highlightedCallstack.length <= 1)
          return false;

        var compareFrames = step.frames.clone();
        if (gInvertCallstack)
          compareFrames.reverse();
        for (var j = 0; j < highlightedCallstack.length; j++) {
          if (highlightedCallstack[j] != compareFrames[j] && compareFrames[j] != "(root)")
            return false;
        }
        return true;
      }
      var histogramData = [];
      var prevName = "";
      var prevRes = -1;
      var maxHeight = 1;
      for (var i = 0; i < data.length; ++i) {
        var value = data[i].frames.length;
        if (maxHeight < value)
          maxHeight = value;
      }
      var skipCount = Math.round(data.length / 2000.0);
      for (var i = 0; i < data.length; i=i+1+skipCount) {
        var step = data[i];
        var name = step.frames;
        var res = step.extraInfo["responsiveness"];
        var value = step.frames.length;
        var color = (res != null ? Math.min(255, Math.round(255.0 * res / 1000.0)):"0") +",0,0";
        if (isSampleSelected(step)) {
          color = "0,128,0";
        }
        if ("marker" in step.extraInfo) {
          // a new marker boundary has been discovered
          var item = {
            name: "marker",
            width: 2,
            value: maxHeight + 1,
            marker: step.extraInfo.marker
          };
          histogramData.push(item);
          var item = {
            name: name,
            width: 1,
            value: value,
            color: "rgb(" + color + ")",
          };
          histogramData.push(item);
        } else if (name != prevName || res != prevRes) {
          // a new name boundary has been discovered
          var item = {
            name: name,
            width: 1,
            value: value,
            color: "rgb(" + color + ")",
          };
          histogramData.push(item);
        } else {
          // the continuation of the previous data
          histogramData[histogramData.length - 1].width++;
        }
        prevName = name;
        prevRes = res;
      }
      return histogramData;
    }
    var histogramData = convertToHistogramData(data);
    var count = histogramData.length;
    var width = container.clientWidth,
        height = container.clientHeight;

    removeAllChildren(container);
    removeAllChildren(markerContainer);

    // Add the filtering UI
    var iconBox = document.createElement("div");
    iconBox.setAttribute("id", "iconbox");
    var filterButton = document.createElement("img");
    filterButton.setAttribute("src", "images/filter.png");
    filterButton.setAttribute("id", "filter");
    filterButton.setAttribute("class", "hidden");
    filterButton.setAttribute("title", "Show only the samples from the selected range");
    iconBox.appendChild(filterButton);
    var showallButton = document.createElement("img");
    showallButton.setAttribute("src", "images/showall.png");
    showallButton.setAttribute("id", "showall");
    if (gVisibleRange.isShowAll()) {
      showallButton.setAttribute("class", "hidden");
    } else {
      showallButton.setAttribute("class", "");
    }
    try {
      showallButton.removeEventListener("click", showall_onClick, false);
    } catch (err) {
    }
    showallButton.addEventListener("click", function showall_onClick() {
      displaySample(0, gSamples.length);
      document.getElementById("showall").className = "hidden";
    }, false);
    showallButton.setAttribute("title", "Show all of the samples");
    iconBox.appendChild(showallButton);
    container.appendChild(iconBox);

    // construct the SVG root element
    const kSVGNS = "http://www.w3.org/2000/svg";
    var svgRoot = document.createElementNS(kSVGNS, "svg");
    svgRoot.setAttribute("version", "1.1");
    svgRoot.setAttribute("baseProfile", "full");
    svgRoot.setAttribute("width", width);
    svgRoot.setAttribute("height", height);
    container.appendChild(svgRoot);

    // Define the marker gradient
    var markerGradient = document.createElementNS(kSVGNS, "linearGradient");
    markerGradient.setAttribute("id", "markerGradient");
    //markerGradient.setAttribute("x1", "0%");
    //markerGradient.setAttribute("y1", "0%");
    //markerGradient.setAttribute("x2", "0%");
    //markerGradient.setAttribute("y2", "100%");
    var stop1 = document.createElementNS(kSVGNS, "stop");
    stop1.setAttribute("offset", "0%");
    stop1.setAttribute("style", "stop-color: blue; stop-opacity: 1;");
    markerGradient.appendChild(stop1);
    var stop2 = document.createElementNS(kSVGNS, "stop");
    stop2.setAttribute("offset", "100%");
    stop2.setAttribute("style", "stop-color: red; stop-opacity: 1;");
    markerGradient.appendChild(stop2);
    var defs = document.createElementNS(kSVGNS, "defs");
    defs.appendChild(markerGradient);
    svgRoot.appendChild(defs);

    function createRect(container, step, x, y, w, h, color) {
      var rect = document.createElementNS(kSVGNS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("fill", color);
      rect.setAttribute("class", "rect");
      container.appendChild(rect);
      rect.addEventListener("click", function() {
        if (step.name == null) return;
        selectSample(step.name);
      }, false);
      rect.addEventListener("mouseover", function() {
        rect.setAttribute("fill-opacity", "0.8");
      }, false);
      rect.addEventListener("mouseout", function() {
        rect.removeAttribute("fill-opacity");
      }, false);
      return rect;
    }

    // iterate over the histogram items and create rects for each one
    var widthSum = 0, maxHeight = 0;
    for (var i = 0; i < count; ++i) {
      var step = histogramData[i];
      widthSum += step.width;
      if (step.value > maxHeight) {
        maxHeight = step.value;
      }
    }
    var widthFactor = width / widthSum;
    var heightFactor = height / maxHeight;
    var widthSeenSoFar = 0;
    for (var i = 0; i < count; ++i) {
      var step = histogramData[i];
      var rect = createRect(svgRoot, step, widthSeenSoFar,
                            (maxHeight - step.value) * heightFactor,
                            step.width * widthFactor,
                            step.value * heightFactor,
                            step.color);
      if ("marker" in step) {
        rect.setAttribute("title", step.marker);
        rect.setAttribute("fill", "url(#markerGradient)");
      }
      widthSeenSoFar += step.width * widthFactor;
    }

    function gatherMarkersList(histogramData) {
      var markers = [];
      for (var i = 0; i < histogramData.length; ++i) {
        var step = histogramData[i];
        if ("marker" in step) {
          markers.push({
            index: i,
            name: step.marker
          });
        }
      }
      return markers;
    }

    var markers = gatherMarkersList(histogramData);
    var rangeSelector = new RangeSelector(markerContainer);
    rangeSelector.render(svgRoot, markers);
    rangeSelector.enableRangeSelectionOnHistogram(svgRoot);
  }
};

function RangeSelector(container) {
  this.container = container;
}
RangeSelector.prototype = {
  render: function RangeSelector_render(graph, markers) {
    removeAllChildren(markers);

    var select = document.createElement("select");
    select.setAttribute("multiple", "multiple");
    select.setAttribute("size", markers.length);
    this.container.appendChild(select);
    this.selector = select;

    for (var i = 0; i < markers.length; ++i) {
      var marker = markers[i];
      var option = document.createElement("option");
      option.appendChild(document.createTextNode(marker.name));
      option.setAttribute("data-index", marker.index);
      select.appendChild(option);
    }

    // Prepare the filtering UI
    var self = this;
    var filter = document.getElementById("filter");
    try {
      filter.removeEventListener("click", filter_onClick, false);
    } catch (err) {
    }
    filter.addEventListener("click", function filter_onClick() {
      self.filterCurrentRange(graph);
    }, false);

    try {
      select.removeEventListener("click", select_onChange, false);
    } catch (err) {
    }
    select.addEventListener("change", function select_onChange(e) {
      if (self.changeEventSuppressed) {
        return;
      }

      // look for non-consecutive ranges, and make them consecutive
      var range = [];
      var children = select.childNodes;
      for (var i = 0; i < children.length; ++i) {
        range.push(children[i].selected);
      }
      var begin = -1, end = -1;
      for (var i = 0; i < range.length; ++i) {
        if (begin == -1 && range[i]) {
          begin = i;
        } else if (begin != -1 && range[i]) {
          end = i;
        }
      }
      if (begin > -1) {
        for (var i = begin; i <= end; ++i) {
          children[i].selected = true;
        }
      }
      if (end > -1) {
        for (var i = end + 1; i < children.length; ++i) {
          children[i].selected = false;
        }
      }

      // highlight the range in the histogram
      var prevHilite = document.querySelector("." + hiliteClassName);
      if (prevHilite) {
        prevHilite.parentNode.removeChild(prevHilite);
      }
      document.getElementById("filter").className = "hidden";
      const hilitedMarker = "markerHilite";
      var prevMarkerHilite = document.querySelector("#" + hilitedMarker);
      if (prevMarkerHilite) {
        prevMarkerHilite.removeAttribute("id");
        prevMarkerHilite.removeAttribute("style");
      }
      function rect(index) {
        return graph.querySelectorAll(".rect")[children[index].getAttribute("data-index")];
      }
      if (begin > end) {
        // Just highlight the respective marker in the histogram
        rect(begin).setAttribute("id", hilitedMarker);
        rect(begin).setAttribute("style", "fill: red;");
      } else if (end > begin) {
        self.drawHiliteRectangle(graph,
                                 rect(begin).getAttribute("x"),
                                 0,
                                 parseFloat(rect(end).getAttribute("width")) +
                                 parseFloat(rect(end).getAttribute("x")) -
                                 parseFloat(rect(begin).getAttribute("x")),
                                 graph.getAttribute("height"));
      }
    }, false);
  },
  drawHiliteRectangle: function RangeSelector_drawHiliteRectangle(graph, x, y, width, height) {
    var hilite = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    hilite.setAttribute("x", x);
    hilite.setAttribute("y", 0);
    hilite.setAttribute("width", width);
    hilite.setAttribute("height", height);
    hilite.setAttribute("fill", "gray");
    hilite.setAttribute("fill-opacity", "0.5");
    hilite.setAttribute("class", hiliteClassName);
    hilite.setAttribute("style", "pointer-events: none");
    graph.appendChild(hilite);
    document.getElementById("filter").className = "";
    return hilite;
  },
  clearCurrentRangeSelection: function RangeSelector_clearCurrentRangeSelection() {
    try {
      this.changeEventSuppressed = true;
      var children = this.selector.childNodes;
      for (var i = 0; i < children.length; ++i) {
        children[i].selected = false;
      }
    } finally {
      this.changeEventSuppressed = false;
    }
  },
  enableRangeSelectionOnHistogram: function RangeSelector_enableRangeSelectionOnHistogram(graph) {
    var isDrawingRectangle = false;
    var origX, origY;
    var hilite = null;
    var self = this;
    function updateHiliteRectangle(newX, newY) {
      var startX = Math.min(newX, origX) - graph.parentNode.offsetLeft;
      var startY = 0;
      var width = Math.abs(newX - origX);
      var height = graph.parentNode.clientHeight;
      if (hilite) {
        hilite.setAttribute("x", startX);
        hilite.setAttribute("y", startY);
        hilite.setAttribute("width", width);
        hilite.setAttribute("height", height);
      } else {
        if (width) {
          var prevHilite = document.querySelector("." + hiliteClassName);
          if (prevHilite) {
            prevHilite.parentNode.removeChild(prevHilite);
          }
          self.clearCurrentRangeSelection();
          hilite = self.drawHiliteRectangle(graph, startX, startY, width, height);
        }
      }
    }
    graph.addEventListener("mousedown", function(e) {
      var prevHilite = document.querySelector("." + hiliteClassName);
      if (prevHilite) {
        prevHilite.parentNode.removeChild(prevHilite);
      }
      isDrawingRectangle = true;
      origX = e.pageX;
      origY = e.pageY;
    }, false);
    graph.addEventListener("mouseup", function(e) {
      updateHiliteRectangle(e.pageX, e.pageY);
      isDrawingRectangle = false;
      hilite = null;
    }, false);
    graph.addEventListener("mousemove", function(e) {
      if (isDrawingRectangle) {
        updateHiliteRectangle(e.pageX, e.pageY);
      }
    }, false);
  },
  filterCurrentRange: function RangeSelector_filterCurrentRange(graph) {
    // First, retrieve the current range of filtered samples
    function sampleIndexFromPoint(x) {
      var totalSamples = parseFloat(gVisibleRange.end - gVisibleRange.start - 1);
      var width = parseFloat(graph.parentNode.clientWidth);
      var factor = totalSamples / width;
      return gVisibleRange.start + parseInt(parseFloat(x) * factor);
    }

    var hiliteRect = document.querySelector("." + hiliteClassName);
    var start = sampleIndexFromPoint(hiliteRect.getAttribute("x"));
    var end = sampleIndexFromPoint(parseFloat(hiliteRect.getAttribute("x")) +
                                   parseFloat(hiliteRect.getAttribute("width")));
    displaySample(start, end + 1);

    var self = this;
    var showall = document.getElementById("showall");
    try {
      showall.removeEventListener("click", showall_onClick, false);
    } catch (err) {
    }
    showall.addEventListener("click", function showall_onClick() {
      self.resetFilter();
    }, false);
    showall.className = "";
  },
  resetFilter: function RangeSelector_resetFilter() {
    displaySample(0, gSamples.length);
    document.getElementById("showall").className = "hidden";
  }
};

function maxResponsiveness(start, end) {
  var data = gVisibleRange.filter(start, end);
  var maxRes = 0.0;
  for (var i = 0; i < data.length; ++i) {
    if (data[i].extraInfo["responsiveness"] == null) continue;
    if (maxRes < data[i].extraInfo["responsiveness"])
      maxRes = data[i].extraInfo["responsiveness"];
  }
  return maxRes;
}

function avgResponsiveness(start, end) {
  var data = gVisibleRange.filter(start, end);
  var totalRes = 0.0;
  for (var i = 0; i < data.length; ++i) {
    if (data[i].extraInfo["responsiveness"] == null) continue;
    totalRes += data[i].extraInfo["responsiveness"];
  }
  return totalRes / data.length;
}

function copyProfile() {
  window.prompt ("Copy to clipboard: Ctrl+C, Enter", document.getElementById("data").value);
}

function uploadProfile(selected) {
  var oXHR = new XMLHttpRequest();
  oXHR.open("POST", "http://profile-logs.appspot.com/store", true);
  oXHR.onload = function (oEvent) {
    if (oXHR.status == 200) {  
      document.getElementById("upload_status").innerHTML = document.URL.split('?')[0] + "?report=" + oXHR.responseText;
    } else {  
      document.getElementById("upload_status").innerHTML = "Error " + oXHR.status + " occurred uploading your file.";
    }  
  };

  var dataToUpload;
  var dataSize;
  if (selected === true) {
    dataToUpload = gVisibleRange.getTextData();
  } else {
    dataToUpload = document.getElementById("data").value;
  }

  if (dataToUpload.length > 1024*1024) {
    dataSize = (dataToUpload.length/1024/1024) + " MB(s)";
  } else {
    dataSize = (dataToUpload.length/1024) + " KB(s)";
  }

  var formData = new FormData();
  formData.append("file", dataToUpload);
  document.getElementById("upload_status").innerHTML = "Uploading Profile (" + dataSize + ")";
  oXHR.send(formData);

}

function populate_skip_symbol() {
  var skipSymbolCtrl = document.getElementById('skipsymbol')
  //skipSymbolCtrl.options = gSkipSymbols;
  for (var i = 0; i < gSkipSymbols.length; i++) {
    var elOptNew = document.createElement('option');
    elOptNew.text = gSkipSymbols[i];
    elOptNew.value = gSkipSymbols[i];
    elSel.add(elOptNew);
  }
    
}

function delete_skip_symbol() {
  var skipSymbol = document.getElementById('skipsymbol').value
}

function add_skip_symbol() {
  
}

var gFilterChangeCallback = null;
function filterOnChange() {
  if (gFilterChangeCallback != null) {
    clearTimeout(gFilterChangeCallback);
    gFilterChangeCallback = null;
  }

  gFilterChangeCallback = setTimeout(filterUpdate, 200); 
}
function filterUpdate() {
  gFilterChangeCallback = null;

  displaySample(gVisibleRange.start, gVisibleRange.end); 

  filterNameInput = document.getElementById("filterName");
  if (filterNameInput != null) {
    filterNameInput.focus();
  } 
}

function updateDescription() {
  var infobar = document.getElementById("infobar");
  var infoText = "";
  
  infoText += "Total Samples: " + gSamples.length + "<br>\n";
  infoText += "<br>\n";
  infoText += "Selection:<br>\n";
  infoText += "--Range: [" + gVisibleRange.start + "," + gVisibleRange.end + "]<br>\n";
  infoText += "--Avg. Responsiveness: " + avgResponsiveness(gVisibleRange.start, gVisibleRange.end).toFixed(2) + " ms<br>\n";
  infoText += "--Max Responsiveness: " + maxResponsiveness(gVisibleRange.start, gVisibleRange.end).toFixed(2) + " ms<br>\n";
  infoText += "<br>\n";
  infoText += "<label><input type='checkbox' id='invertCallstack' " + (gInvertCallstack ?" checked='true' ":" ") + " onchange='toggleInvertCallStack()'/>Invert callstack</label><br />\n";
  infoText += "<label><input type='checkbox' id='mergeUnbranched' " + (gMergeUnbranched ?" checked='true' ":" ") + " onchange='toggleMergeUnbranched()'/>Merge unbranched call paths</label><br />\n";
  infoText += "<label><input type='checkbox' id='mergeFunctions' " + (gMergeFunctions ?" checked='true' ":" ") + " onchange='toggleMergeFunctions()'/>Functions, not lines</label><br />\n";

  var filterNameInputOld = document.getElementById("filterName");
  infoText += "<br>\n";
  infoText += "Filter:\n";
  infoText += "<input type='text' id='filterName' oninput='filterOnChange()'/><br>\n";

  infoText += "<br>\n";
  infoText += "Share:<br>\n";
  infoText += "<a id='upload_status'>No upload in progress</a><br />\n";
  infoText += "<input type='button' id='upload' value='Upload full profile'/>\n";
  infoText += "<input type='button' id='upload_select' value='Upload view'/><br />\n";

  //infoText += "<br>\n";
  //infoText += "Skip functions:<br>\n";
  //infoText += "<select size=8 id='skipsymbol'></select><br />"
  //infoText += "<input type='button' id='delete_skipsymbol' value='Delete'/><br />\n";
  //infoText += "<input type='button' id='add_skipsymbol' value='Add'/><br />\n";
  
  infobar.innerHTML = infoText;

  var filterNameInputNew = document.getElementById("filterName");
  if (filterNameInputOld != null && filterNameInputNew != null) {
    filterNameInputNew.parentNode.replaceChild(filterNameInputOld, filterNameInputNew);
    //filterNameInputNew.value = filterNameInputOld.value;
  }
  document.getElementById('upload').onclick = uploadProfile;
  document.getElementById('upload_select').onclick = function() {
    uploadProfile(true);
  };
  //document.getElementById('delete_skipsymbol').onclick = delete_skip_symbol;
  //document.getElementById('add_skipsymbol').onclick = add_skip_symbol;

  //populate_skip_symbol();
}

var gSamples = [];
var gHighlightedCallstack = [];
var gSkipSymbols = ["test2", "test1"];
var gVisibleRange = {
  start: -1,
  end: -1,
  filter: function(start, end) {
    this.start = start;
    this.end = end;
    return gSamples.slice(start, end);
  },
  isShowAll: function() {
    return (this.start == -1 && this.end == -1) || (this.start <= 0 && this.end >= gSamples.length);
  },
  getTextData: function() {
    var data = [];
    var samples = gSamples.slice(this.start, this.end);
    for (var i = 0; i < samples.length; i++) {
      data.push(samples[i].lines.join("\n"));
    }
    return data.join("\n");
  } 
};

function parse() {
  var parser = new Parser();
  gSamples = parser.parse(document.getElementById("data").value);
  displaySample(0, gSamples.length);
}

var gInvertCallstack = false;
function toggleInvertCallStack() {
  gInvertCallstack = !gInvertCallstack;
  displaySample(gVisibleRange.start, gVisibleRange.end); 
}

var gMergeUnbranched = false;
function toggleMergeUnbranched() {
  gMergeUnbranched = !gMergeUnbranched;
  displaySample(gVisibleRange.start, gVisibleRange.end); 
}

var gMergeFunctions = true;
function toggleMergeFunctions() {
  gMergeFunctions = !gMergeFunctions;
  displaySample(gVisibleRange.start, gVisibleRange.end); 
}

function setHighlightedCallstack(samples) {
  gHighlightedCallstack = samples;

  var parser = new Parser();
  var data = gVisibleRange.filter(gVisibleRange.start, gVisibleRange.end);
  var histogram = document.getElementById("histogram");
  var histogramRenderer = new HistogramRenderer();
  var filteredData = data;
  var filterNameInput = document.getElementById("filterName");
  if (filterNameInput != null && filterNameInput.value != "") {
    filteredData = parser.filterByName(data, document.getElementById("filterName").value);
  }
  if (gMergeFunctions) {
    filteredData = parser.discardLineLevelInformation(filteredData);
  }
  histogramRenderer.render(filteredData, histogram, gHighlightedCallstack,
                           document.getElementById("markers"));
  updateDescription();
}

function selectSample(sample) {
  gHighlightedCallstack = sample;
  
  //displaySample(gVisibleRange.start, gVisibleRange.end);
}

function displaySample(start, end) {
  document.getElementById("dataentry").className = "hidden";
  document.getElementById("ui").className = "";

  var data = gVisibleRange.filter(start, end);

  var parser = new Parser();
  var treeData;
  var filteredData = data;
  var filterNameInput = document.getElementById("filterName");
  if (filterNameInput != null && filterNameInput.value != "") {
    filteredData = parser.filterByName(data, document.getElementById("filterName").value);
  }
  if (gMergeFunctions) {
    filteredData = parser.discardLineLevelInformation(filteredData);
  }
  treeData = parser.convertToCallTree(filteredData, gInvertCallstack);
  if (gMergeUnbranched) {
    parser.mergeUnbranchedCallPaths(treeData);
  }
  var treeFeeder = new TreeFeeder(document.getElementById("tree"));
  treeFeeder.render(treeData);
  var histogram = document.getElementById("histogram");
  var width = histogram.clientWidth,
      height = histogram.clientHeight;
  histogram.style.width = width + "px";
  histogram.style.height = height + "px";
  var histogramRenderer = new HistogramRenderer();
  histogramRenderer.render(filteredData, histogram, gHighlightedCallstack,
                           document.getElementById("markers"));
  updateDescription();
}
