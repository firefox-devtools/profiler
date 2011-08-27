jQuery.jstree.THEMES_DIR = "jstree/themes/";

function TreeRenderer() {}
TreeRenderer.prototype = {
  render: function TreeRenderer_render(tree, container) {
    function convertToJSTreeData(tree) {
      var object = {};
      function childVisitor(node, curObj) {
        curObj.title = node.counter + " " + node.name;
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
  render: function HistogramRenderer_render(data, container) {
    function convertToHistogramData(data) {
      var histogramData = [];
      var prevName = "";
      var parser = new Parser();
      for (var i = 0; i < data.length; ++i) {
        var step = data[i];
        var name = step.name;
        var value = parser.parseCallStack(name).length;
        if (name != prevName) {
          // a new name boundary has been discovered
          var item = {
            name: name,
            width: 1,
            value: value
          };
          histogramData.push(item);
          prevName = name;
        } else if ("marker" in step.extraInfo) {
          // a new marker boundary has been discovered
          var item = {
            name: name,
            width: 1,
            value: value,
            marker: step.extraInfo.marker
          };
          histogramData.push(item);
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
      createRect(svgRoot, widthSeenSoFar, 0,
                 step.width * widthFactor,
                 step.value * heightFactor,
                 "blue");
      widthSeenSoFar += step.width * widthFactor;
    }
  }
};

function parse() {
  var parser = new Parser();
  var data = parser.parse(document.getElementById("data").value);
  var treeData = parser.convertToCallTree(data);
  var tree = document.createElement("div");
  document.body.appendChild(tree);
  var treeRenderer = new TreeRenderer();
  treeRenderer.render(treeData, tree);
  var histogram = document.createElement("div");
  histogram.style.width = "800px";
  histogram.style.height = "400px";
  document.body.appendChild(histogram);
  var histogramRenderer = new HistogramRenderer();
  histogramRenderer.render(data, histogram);
}
