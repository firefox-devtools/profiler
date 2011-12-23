jQuery.jstree.THEMES_DIR = "jstree/themes/";
jQuery.fx.off = true;

const hiliteClassName = "histogramHilite";

function removeAllChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function treeObjSort(a, b) {
  return b.counter - a.counter;
}

function TreeRenderer() {}
TreeRenderer.prototype = {
  render: function TreeRenderer_render(tree, container) {
    function convertToJSTreeData(tree) {
      var roots = [];
      var object = {};
      function childVisitor(node, curObj) {
        var totalCount = node.totalSamples;
        var percent = (100 * node.counter / totalCount).toFixed(2);
        curObj.title = node.counter + " (" + percent + "%) " + node.name;
        //dump("Add node: " + curObj.title + "\n");
        curObj.counter = node.counter;
        if (node.children.length) {
          curObj.children = [];
          var unknownCounter = node.counter;
          for (var i = 0; i < node.children.length; ++i) {
            var child = node.children[i];
            var newObj = {};
            var totalCount = child.totalSamples;
            if (child.depth < 15)
              childVisitor(child, newObj);
            curObj.children.push(newObj);
            unknownCounter -= child.counter;
          }
          if (unknownCounter != 0) {
            var child = node.children[i];
            var newObj = {};
            var percent = (100 * unknownCounter / node.counter).toFixed(2);
            newObj.counter = unknownCounter;
            newObj.title = unknownCounter + " (" + percent + "%) ??? Unknown";
            curObj.children.push(newObj);
          }
          curObj.children.sort(treeObjSort);
          curObj.children = curObj.children.splice(0, 20);
        }
      }
      // Need to handle multiple root for heavy tree
      if (tree instanceof Array) {
        for(var i = 0; i < tree.length; i++) {
          object = {};
          var totalCount = tree[i].totalSamples;
          childVisitor(tree[i], object);
          roots.push(object);
        }
      } else {
        var totalCount = tree.totalSamples;
        childVisitor(tree, object);
        roots.push(object);
      }
      roots.sort(treeObjSort);
      return {data: roots};
    }
    jQuery(container).jstree({
      json: convertToJSTreeData(tree),
      plugins: ["themes", "json", "ui", "hotkeys"]
    });
  }
};

function HistogramRenderer() {}
HistogramRenderer.prototype = {
  render: function HistogramRenderer_render(data, container,
                                            markerContainer) {
    function convertToHistogramData(data) {
      var histogramData = [];
      var prevName = "";
      var prevRes = -1;
      var parser = new Parser();
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
            color: "rgb(" + (res != null ? Math.min(255, Math.round(255.0 * res / 1000.0)):"0") +",0,0)",
          };
          histogramData.push(item);
        } else if (name != prevName || res != prevRes) {
          // a new name boundary has been discovered
          var item = {
            name: name,
            width: 1,
            value: value,
            color: "rgb(" + (res != null ? Math.min(255, Math.round(255.0 * res / 1000.0)):"0") +",0,0)",
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
    showallButton.setAttribute("class", "hidden");
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

    function createRect(container, x, y, w, h, color) {
      var rect = document.createElementNS(kSVGNS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("fill", color);
      rect.setAttribute("class", "rect");
      container.appendChild(rect);
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
      var rect = createRect(svgRoot, widthSeenSoFar, 0,
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
    if (maxRes < data[i].extraInfo["responsiveness"])
      maxRes = data[i].extraInfo["responsiveness"];
  }
  return maxRes;
}

function avgResponsiveness(start, end) {
  var data = gVisibleRange.filter(start, end);
  var totalRes = 0.0;
  for (var i = 0; i < data.length; ++i) {
    totalRes += data[i].extraInfo["responsiveness"];
  }
  return totalRes / data.length;
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
  infoText += "<input type='checkbox' id='heavy' " + (gIsHeavy?" checked='true' ":" ") + " onchange='toggleHeavy()'/>Heavy callstack<br />\n";

  infobar.innerHTML = infoText;
}

var gSamples = [];
var gVisibleRange = {
  start: -1,
  end: -1,
  filter: function(start, end) {
    this.start = start;
    this.end = end;
    return gSamples.slice(start, end);
  }
};

function parse() {
  var parser = new Parser();
  gSamples = parser.parse(document.getElementById("data").value);
  displaySample(0, gSamples.length);
}

var gIsHeavy = false;
function toggleHeavy() {
  gIsHeavy = !gIsHeavy;
  displaySample(gVisibleRange.start, gVisibleRange.end); 
}

function displaySample(start, end) {
  document.getElementById("dataentry").className = "hidden";
  document.getElementById("ui").className = "";

  var data = gVisibleRange.filter(start, end);

  var parser = new Parser();
  var treeData;
  if (gIsHeavy) {
    treeData = parser.convertToHeavyCallTree(data);
  } else {
    treeData = parser.convertToCallTree(data);
  }
  var tree = document.getElementById("tree");
  var treeRenderer = new TreeRenderer();
  treeRenderer.render(treeData, tree);
  var histogram = document.getElementById("histogram");
  var width = histogram.clientWidth,
      height = histogram.clientHeight;
  histogram.style.width = width + "px";
  histogram.style.height = height + "px";
  var histogramRenderer = new HistogramRenderer();
  histogramRenderer.render(data, histogram,
                           document.getElementById("markers"));
  updateDescription();
}
