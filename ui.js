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

function parse() {
  var parser = new Parser();
  var data = parser.parse(document.getElementById("data").value);
  data = parser.convertToCallTree(data);
  document.getElementById("result").textContent = data.toSource();
  var tree = document.createElement("div");
  document.body.appendChild(tree);
  var treeRenderer = new TreeRenderer();
  treeRenderer.render(data, tree);
}
