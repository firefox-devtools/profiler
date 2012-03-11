const hiliteClassName = "histogramHilite";
const kSVGNS = "http://www.w3.org/2000/svg";

function removeAllChildren(element) {
  while (element.firstChild) {
    element.removeChild(element.firstChild);
  }
}

function treeObjSort(a, b) {
  return b.counter - a.counter;
}

function ProfileTreeManager(container) {
  this.treeView = new TreeView();
  this.treeView.setColumns([
    { name: "sampleCount", title: "Running time" },
    { name: "selfSampleCount", title: "Self" },
    { name: "symbolName", title: "Symbol Name"},
  ]);
  var self = this;
  this.treeView.addEventListener("select", function (frameData) {
    self.highlightFrame(frameData);
  });
  container.appendChild(this.treeView.getContainer());
}
ProfileTreeManager.prototype = {
  highlightFrame: function Treedisplay_highlightFrame(frameData) {
    var selectedCallstack = [];
    var curr = frameData;
    while (curr != null) {
      if (curr.name != null) {
        var subCallstack = curr.fullFrameNamesAsInSample.clone();
        subCallstack.reverse();
        selectedCallstack = selectedCallstack.concat(subCallstack);
      }
      curr = curr.parent;
    }
    selectedCallstack.reverse();
    if (gInvertCallstack)
      selectedCallstack.shift(); // remove (total)
    setHighlightedCallstack(selectedCallstack);
  },
  display: function ProfileTreeManager_display(tree) {
    this.treeView.display(this.convertToJSTreeData(tree));
  },
  convertToJSTreeData: function ProfileTreeManager__convertToJSTreeData(tree) {
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
      curObj.fullFrameNamesAsInSample = node.mergedNames ? node.mergedNames : [node.name];
      var info = Parser.getFunctionInfo(node.name);
      curObj.name = (info.functionName + " " + info.lineInformation).trim();
      curObj.library = info.libraryName;
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

function HistogramView(container, markerContainer) {
  this._container = container;
  this._markerContainer = markerContainer;
  this._svgRoot = this._createSVGRoot(container.clientWidth, container.clientHeight);
  this._rangeSelector = new RangeSelector(markerContainer, this._svgRoot);
  this._rangeSelector.enableRangeSelectionOnHistogram();

}
HistogramView.prototype = {
  _createSVGRoot: function HistogramView__createSVGRoot(width, height) {
    // construct the SVG root element
    var svgRoot = document.createElementNS(kSVGNS, "svg");
    svgRoot.setAttribute("version", "1.1");
    svgRoot.setAttribute("baseProfile", "full");
    svgRoot.setAttribute("width", width);
    svgRoot.setAttribute("height", height);
    this._container.appendChild(svgRoot);
    return svgRoot;
  },
  _createMarkerGradient: function HistogramView__createMarkerGradient() {
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
    return markerGradient;
  },
  _createDefs: function HistogramView__createDefs() {
    var defs = document.createElementNS(kSVGNS, "defs");
    defs.appendChild(this._createMarkerGradient());
    return defs;
  },
  _createRect: function HistogramView__createRect(container, step, x, y, w, h, color) {
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
  },
  _gatherMarkersList: function HistogramView__gatherMarkersList(histogramData) {
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
  },
  display: function HistogramView_display(data, highlightedCallstack) {
    var container = this._container;
    var markerContainer = this._markerContainer;
    var histogramData = this._convertToHistogramData(data, highlightedCallstack);
    var count = histogramData.length;
    var width = container.clientWidth,
        height = container.clientHeight;

    removeAllChildren(this._svgRoot);
    removeAllChildren(markerContainer);

    this._svgRoot.appendChild(this._createDefs());

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
      var rect = this._createRect(this._svgRoot, step, widthSeenSoFar,
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

    var markers = this._gatherMarkersList(histogramData);
    this._rangeSelector.display(markers);
  },
  _convertToHistogramData: function HistogramView_convertToHistogramData(data, highlightedCallstack) {
    function isSampleSelected(step) {
      if (step.frames.length < highlightedCallstack.length ||
          highlightedCallstack.length <= (gInvertCallstack ? 0 : 1))
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
  },
};

function RangeSelector(container, graph) {
  this.container = container;
  this._graph = graph;
  this._selectedRange = { startX: 0, endX: 0 };
  this._selectedSampleRange = { start: 0, end: 0 };
}
RangeSelector.prototype = {
  display: function RangeSelector_display(markers) {
    var graph = this._graph;
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
        self.drawHiliteRectangle(rect(begin).getAttribute("x"),
                                 0,
                                 parseFloat(rect(end).getAttribute("width")) +
                                 parseFloat(rect(end).getAttribute("x")) -
                                 parseFloat(rect(begin).getAttribute("x")),
                                 graph.getAttribute("height"));
      }
    }, false);
  },
  drawHiliteRectangle: function RangeSelector_drawHiliteRectangle(x, y, width, height) {
    var hilite = document.querySelector("." + hiliteClassName);
    hilite.style.left = x + "px";
    hilite.style.top = "0";
    hilite.style.width = width + "px";
    hilite.style.height = height + "px";
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
  enableRangeSelectionOnHistogram: function RangeSelector_enableRangeSelectionOnHistogram() {
    var graph = this._graph;
    var isDrawingRectangle = false;
    var origX, origY;
    var self = this;
    function updateHiliteRectangle(newX, newY) {
      var startX = Math.min(newX, origX) - graph.parentNode.getBoundingClientRect().left;
      var startY = 0;
      var width = Math.abs(newX - origX);
      var height = graph.parentNode.clientHeight;
      self._selectedRange.startX = startX;
      self._selectedRange.endX = startX + width;
      self.drawHiliteRectangle(startX, startY, width, height);
    }
    graph.addEventListener("mousedown", function(e) {
      if (e.button != 0)
        return;
      isDrawingRectangle = true;
      self.beginHistogramSelection();
      origX = e.pageX;
      origY = e.pageY;
      if (this.setCapture)
        this.setCapture();
      // Reset the highlight rectangle
      updateHiliteRectangle(e.pageX, e.pageY);
      e.preventDefault();
    }, false);
    graph.addEventListener("mouseup", function(e) {
      if (isDrawingRectangle) {
        updateHiliteRectangle(e.pageX, e.pageY);
        isDrawingRectangle = false;
        self.finishHistogramSelection(e.pageX != origX);
      }
    }, false);
    graph.addEventListener("mousemove", function(e) {
      if (isDrawingRectangle) {
        updateHiliteRectangle(e.pageX, e.pageY);
      }
    }, false);
  },
  beginHistogramSelection: function RangeSelector_beginHistgramSelection() {
    var hilite = document.querySelector("." + hiliteClassName);
    hilite.classList.remove("finished");
    hilite.classList.add("selecting");
    hilite.classList.remove("collapsed");
    if (this._transientRestrictionEnteringAffordance) {
      this._transientRestrictionEnteringAffordance.discard();
    }
  },
  finishHistogramSelection: function RangeSelector_finishHistgramSelection(isSomethingSelected) {
    var self = this;
    var hilite = document.querySelector("." + hiliteClassName);
    hilite.classList.remove("selecting");
    if (isSomethingSelected) {
      hilite.classList.add("finished");
      var start = this._sampleIndexFromPoint(this._selectedRange.startX);
      var end = this._sampleIndexFromPoint(this._selectedRange.endX);
      self._transientRestrictionEnteringAffordance = gNestedRestrictions.add({
        title: "Sample Range",
        enterCallback: function () {
          self.filterRange(start, end);
        }
      });
    } else {
      hilite.classList.add("collapsed");
    }
  },
  collapseHistogramSelection: function RangeSelector_collapseHistogramSelection() {
    var hilite = document.querySelector("." + hiliteClassName);
    hilite.classList.add("collapsed");
  },
  _sampleIndexFromPoint: function RangeSelector__sampleIndexFromPoint(x) {
    var totalSamples = parseFloat(gVisibleRange.numSamples());
    var width = parseFloat(this._graph.parentNode.clientWidth);
    var factor = totalSamples / width;
    return gVisibleRange.start + parseInt(parseFloat(x) * factor);
  },
  filterRange: function RangeSelector_filterRange(start, end) {
    gVisibleRange.restrictTo(start, end + 1);
    this.collapseHistogramSelection();
    refreshUI();
  },
};

function BreadcrumbTrail() {
  this._breadcrumbs = [];
  this._selectedBreadcrumbIndex = -1;

  this._containerElement = document.createElement("ol");
  this._containerElement.className = "breadcrumbTrail";
  var self = this;
  this._containerElement.addEventListener("click", function (e) {
    if (!e.target.classList.contains("breadcrumbTrailItem"))
      return;
    self._enter(e.target.breadcrumbIndex);
  });
}
BreadcrumbTrail.prototype = {
  getContainer: function BreadcrumbTrail_getContainer() {
    return this._containerElement;
  },
  /**
   * Add a breadcrumb. The breadcrumb parameter is an object with the following
   * properties:
   *  - title: The text that will be shown in the breadcrumb's button.
   *  - enterCallback: A function that will be called when entering this
   *                   breadcrumb.
   */
  add: function BreadcrumbTrail_add(breadcrumb) {
    if (this._selectedBreadcrumbIndex != this._breadcrumbs.length - 1)
      throw "Can only add new breadcrumbs if the current one is the last one."
    var li = document.createElement("li");
    li.className = "breadcrumbTrailItem";
    li.textContent = breadcrumb.title;
    var index = this._breadcrumbs.length;
    li.breadcrumbIndex = index;
    li.breadcrumbEnterCallback = breadcrumb.enterCallback;
    li.breadcrumbIsTransient = true;
    this._containerElement.appendChild(li);
    this._breadcrumbs.push(li);
    if (index == 0)
      this._enter(index);
    var self = this;
    return {
      discard: function () {
        if (li.breadcrumbIsTransient) {
          self._deleteBeyond(index - 1);
          delete li.breadcrumbIsTransient;
        }
      }
    };
  },
  addAndEnter: function BreadcrumbTrail_addAndEnter(breadcrumb) {
    var removalHandle = this.add(breadcrumb);
    this._enter(this._breadcrumbs.length - 1);
  },
  _enter: function BreadcrumbTrail__select(index) {
    if (index == this._selectedBreadcrumbIndex)
      return;
    var prevSelected = this._breadcrumbs[this._selectedBreadcrumbIndex];
    if (prevSelected)
      prevSelected.classList.remove("selected");
    var li = this._breadcrumbs[index];
    if (!li)
      console.log("li at index " + index + " is null!");
    delete li.breadcrumbIsTransient;
    li.classList.add("selected");
    this._deleteBeyond(index);
    this._selectedBreadcrumbIndex = index;
    li.breadcrumbEnterCallback();
  },
  _deleteBeyond: function BreadcrumbTrail__deleteBeyond(index) {
    while (this._breadcrumbs.length > index + 1) {
      this._hide(this._breadcrumbs[index + 1]);
      this._breadcrumbs.splice(index + 1, 1);
    }
  },
  _hide: function BreadcrumbTrail__hide(breadcrumb) {
    delete breadcrumb.breadcrumbIsTransient;
    breadcrumb.classList.add("deleted");
    setTimeout(function () {
      breadcrumb.parentNode.removeChild(breadcrumb);
    }, 1000);
  }
};

function maxResponsiveness() {
  var data = gVisibleRange.getFilteredData();
  var maxRes = 0.0;
  for (var i = 0; i < data.length; ++i) {
    if (data[i].extraInfo["responsiveness"] == null) continue;
    if (maxRes < data[i].extraInfo["responsiveness"])
      maxRes = data[i].extraInfo["responsiveness"];
  }
  return maxRes;
}

function avgResponsiveness() {
  var data = gVisibleRange.getFilteredData();
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

  refreshUI(); 

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

var gRawProfile = "";
var gSamples = [];
var gHighlightedCallstack = [];
var gTreeManager = null;
var gNestedRestrictions = null;
var gHistogramView = null;
var gCurrentlyShownSampleData = null;
var gSkipSymbols = ["test2", "test1"];
var gVisibleRange = {
  start: -1,
  end: -1,
  restrictTo: function(start, end) {
    this.start = start;
    this.end = end;
  },
  unrestrict: function () {
    this.restrictTo(-1, -1);
  },
  getFilteredData: function () {
    if (this.isShowAll())
      return gSamples;
    return gSamples.slice(this.start, this.end);
  },
  isShowAll: function() {
    return (this.start == -1 && this.end == -1) || (this.start <= 0 && this.end >= gSamples.length);
  },
  numSamples: function () {
    if (this.isShowAll())
      return gSamples.length - 1; // why - 1?
    return this.end - this.start - 1;
  },
  getTextData: function() {
    var data = [];
    var samples = this.getFilteredData();
    for (var i = 0; i < samples.length; i++) {
      data.push(samples[i].lines.join("\n"));
    }
    return data.join("\n");
  } 
};

function loadProfile(rawProfile) {
  gRawProfile = rawProfile;
  gSamples = Parser.parse(rawProfile);
}

var gInvertCallstack = false;
function toggleInvertCallStack() {
  gInvertCallstack = !gInvertCallstack;
  refreshUI();
}

var gMergeUnbranched = false;
function toggleMergeUnbranched() {
  gMergeUnbranched = !gMergeUnbranched;
  refreshUI(); 
}

var gMergeFunctions = true;
function toggleMergeFunctions() {
  gMergeFunctions = !gMergeFunctions;
  refreshUI(); 
}

function setHighlightedCallstack(samples) {
  gHighlightedCallstack = samples;
  gHistogramView.display(gCurrentlyShownSampleData, gHighlightedCallstack);
  updateDescription();
}

function selectSample(sample) {
  gHighlightedCallstack = sample;
}

function enterMainUI() {
  document.getElementById("dataentry").className = "hidden";
  document.getElementById("ui").className = "";
  gTreeManager = new ProfileTreeManager(document.getElementById("tree"));

  var histogram = document.getElementById("histogram");
  gHistogramView = new HistogramView(histogram, document.getElementById("markers"));

  gNestedRestrictions = new BreadcrumbTrail();
  gNestedRestrictions.add({
    title: "Complete Profile",
    enterCallback: function () {
      gVisibleRange.unrestrict();
      refreshUI();
    }
  })
  document.getElementById("mainarea").appendChild(gNestedRestrictions.getContainer());

}

function refreshUI() {
  var start = Date.now();
  var data = gVisibleRange.getFilteredData();
  console.log("visible range filtering: " + (Date.now() - start) + "ms.");
  start = Date.now();

  var treeData;
  var filteredData = data;
  var filterNameInput = document.getElementById("filterName");
  if (filterNameInput != null && filterNameInput.value != "") {
    filteredData = Parser.filterByName(data, document.getElementById("filterName").value);
  }
  if (gMergeFunctions) {
    filteredData = Parser.discardLineLevelInformation(filteredData);
    console.log("line information discarding: " + (Date.now() - start) + "ms.");
    start = Date.now();
  }
  gCurrentlyShownSampleData = filteredData;
  treeData = Parser.convertToCallTree(filteredData, gInvertCallstack);
  console.log("conversion to calltree: " + (Date.now() - start) + "ms.");
  start = Date.now();
  if (gMergeUnbranched) {
    Parser.mergeUnbranchedCallPaths(treeData);
  }
  gTreeManager.display(treeData);
  console.log("tree displaying: " + (Date.now() - start) + "ms.");
  start = Date.now();
  gHistogramView.display(filteredData, gHighlightedCallstack);
  console.log("histogram displaying: " + (Date.now() - start) + "ms.");
  start = Date.now();
  updateDescription();
}
