jQuery.jstree.THEMES_DIR = "jstree/themes/";

function TreeRenderer() {}
TreeRenderer.prototype = {
  render: function TreeRenderer_render(tree, container) {
    function convertToJSTreeData(tree) {
      var object = {};
      var totalCount = tree.totalSamples;
      function childVisitor(node, curObj) {
        var percent = (100 * node.counter / totalCount).toFixed(2);
        curObj.title = node.counter + " (" + percent + "%) " + node.name;
        if (node.children.length) {
          curObj.children = [];
          for (var i = 0; i < node.children.length; ++i) {
            var child = node.children[i];
            var newObj = {};
            childVisitor(child, newObj);
            curObj.children.push(newObj);
          }
        }
      }
      childVisitor(tree, object);
      return {data: [object]};
    }
    jQuery(container).jstree({
      json: convertToJSTreeData(tree),
      plugins: ["themes", "json", "ui"]
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
      var parser = new Parser();
      for (var i = 0; i < data.length; ++i) {
        var step = data[i];
        var name = step.name;
        var value = parser.parseCallStack(name).length;
        if ("marker" in step.extraInfo) {
          // a new marker boundary has been discovered
          var item = {
            name: name,
            width: 1,
            value: value,
            marker: step.extraInfo.marker
          };
          histogramData.push(item);
          prevName = name;
        } else if (name != prevName) {
          // a new name boundary has been discovered
          var item = {
            name: name,
            width: 1,
            value: value
          };
          histogramData.push(item);
          prevName = name;
        } else {
          // the continuation of the previous data
          histogramData[histogramData.length - 1].width++;
        }
      }
      return histogramData;
    }
    var histogramData = convertToHistogramData(data);
    var count = histogramData.length;
    var width = container.clientWidth,
        height = container.clientHeight;

    // construct the SVG root element
    const kSVGNS = "http://www.w3.org/2000/svg";
    var svgRoot = document.createElementNS(kSVGNS, "svg");
    svgRoot.setAttribute("version", "1.1");
    svgRoot.setAttribute("baseProfile", "full");
    svgRoot.setAttribute("width", width);
    svgRoot.setAttribute("height", height);
    container.appendChild(svgRoot);

    function createRect(container, x, y, w, h, color) {
      var rect = document.createElementNS(kSVGNS, "rect");
      rect.setAttribute("x", x);
      rect.setAttribute("y", y);
      rect.setAttribute("width", w);
      rect.setAttribute("height", h);
      rect.setAttribute("fill", color);
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
                            "blue");
      if ("marker" in step) {
        rect.setAttribute("data-marker", step.marker);
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
  }
};

function RangeSelector(container) {
  this.container = container;
}
RangeSelector.prototype = {
  render: function RangeSelector_render(graph, markers) {
    var select = document.createElement("select");
    select.setAttribute("multiple", "multiple");
    select.setAttribute("size", markers.length);
    this.container.appendChild(select);

    for (var i = 0; i < markers.length; ++i) {
      var marker = markers[i];
      var option = document.createElement("option");
      option.appendChild(document.createTextNode(marker.name));
      option.setAttribute("data-index", marker.index);
      select.appendChild(option);
    }

    select.addEventListener("change", function(e) {
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
      for (var i = begin; i <= end; ++i) {
        children[i].selected = true;
      }
      if (end > -1) {
        for (var i = end + 1; i < children.length; ++i) {
          children[i].selected = false;
        }
      }

      // highlight the range in the histogram
      const hiliteClassName = "histogramHilite";
      var prevHilite = document.querySelector("." + hiliteClassName);
      if (prevHilite) {
        prevHilite.parentNode.removeChild(prevHilite);
      }
      function rect(index) {
        return graph.childNodes[children[index].getAttribute("data-index")];
      }
      if (end > begin) {
        var hilite = document.createElementNS("http://www.w3.org/2000/svg", "rect");
        hilite.setAttribute("x", rect(begin).getAttribute("x"));
        hilite.setAttribute("y", 0);
        hilite.setAttribute("width", parseFloat(rect(end).getAttribute("width")) +
                                     parseFloat(rect(end).getAttribute("x")) -
                                     parseFloat(rect(begin).getAttribute("x")));
        hilite.setAttribute("height", graph.getAttribute("height"));
        hilite.setAttribute("fill", "gray");
        hilite.setAttribute("fill-opacity", "0.5");
        hilite.setAttribute("class", hiliteClassName);
        hilite.setAttribute("style", "pointer-events: none");
        graph.appendChild(hilite);
      }
    }, false);
  }
};

function parse() {
  document.getElementById("dataentry").className = "hidden";
  document.getElementById("ui").className = "";

  var parser = new Parser();
  var data = parser.parse(document.getElementById("data").value);
  var treeData = parser.convertToCallTree(data);
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
}
