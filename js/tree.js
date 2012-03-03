function Tree(root, data) {
  this.root = root;
  this.init(data);
  // root is autoselect
  // this.selected = null;
};

Tree.prototype = {
  init: function Tree_init(data) {
    while (this.root.hasChildNodes()) {
      this.root.removeChild(this.root.firstChild);
    }
    var treeRoot = document.createElement("div");
    treeRoot.className = "root";
    this.root.appendChild(treeRoot);
    var firstElem = this._createTree(treeRoot, data.data[0]);
    treeRoot.appendChild(firstElem);
    this._select(firstElem);
    this._toggle(firstElem);
    this.root.onkeypress = this._onkeypress;
    this.root.onclick = this._onclick;
    this.root.focus();
  },
  _createTree: function Tree__createTree(root, data) {
    if (!("title" in data)) {
      return null;
    }
    var div = document.createElement("div");
    div.className = "subtreeContainer collapsed";
    var text = document.createElement("a");
    text.innerHTML = this._HTMLForFunction(data.name);
    div.treeLine = text;
    div.data = data;
    div.treeLine.className = "unselected";
    div.appendChild(text);
    div.treeChildren = [];
    div.treeParent = null;
    div.tree = this;
    if ("children" in data) {
      for (var i = 0; i < data.children.length; ++i) {
        var innerTree = this._createTree(div, data.children[i]);
        if (innerTree) {
          innerTree.treeParent = div;   
          div.appendChild(innerTree);
          div.treeChildren.push(innerTree);
        }
      }
    }
    return div;
  },
  _HTMLForFunction: function Tree__HTMLForFunction(title) {
    return '<input type="button" value="Expand / Collapse" class="expandCollapseButton" tabindex="-1"> ' +
      '<span class="functionName">' + title + '</span>';
  },
  _toggle: function Tree__toggle(div, /* optional */ newCollapsedValue) {
    if (newCollapsedValue === undefined) {
      div.classList.toggle("collapsed");
    } else {
      if (newCollapsedValue)
        div.classList.add("collapsed");
      else
        div.classList.remove("collapsed");
    }
  },
  _toggleAll: function Tree__toggleAll(subtreeRoot, /* optional */ newCollapsedValue) {
    // Expands / collapses all child nodes, too.
    if (newCollapsedValue === undefined)
      newCollapsedValue = !Tree.prototype._isCollapsed(subtreeRoot);
    Tree.prototype._toggle(subtreeRoot, newCollapsedValue);
    var subtree = subtreeRoot.querySelectorAll('.subtreeContainer');
    for (var i = 0; i < subtree.length; ++i) {
      Tree.prototype._toggle(subtree[i], newCollapsedValue);
    }
  },
  _getParent: function Tree__getParent(div) {
    return div.treeParent;
  },
  _getFirstChild: function Tree__getFirstChild(div) {
    if (Tree.prototype._isCollapsed(div))
      return null;
    var child = div.treeChildren[0];
    return child;
  },
  _getLastChild: function Tree__getLastChild(div) {
    if (Tree.prototype._isCollapsed(div))
      return div;
    var lastChild = div.treeChildren[div.treeChildren.length-1];
    if (lastChild == null)
      return div;
    return Tree.prototype._getLastChild(lastChild);
  },
  _getPrevSib: function Tree__getPevSib(div) {
    if (div.treeParent == null)
      return null;
    var nodeIndex = div.treeParent.treeChildren.indexOf(div);
    if (nodeIndex == 0)
      return null;
    return div.treeParent.treeChildren[nodeIndex-1];
  },
  _getNextSib: function Tree__getNextSib(div) {
    if (div.treeParent == null)
      return null;
    var nodeIndex = div.treeParent.treeChildren.indexOf(div);
    if (nodeIndex == div.treeParent.treeChildren.length - 1)
      return Tree.prototype._getNextSib(div.treeParent);
    return div.treeParent.treeChildren[nodeIndex+1];
  },
  _scrollIntoView: function Tree__scrollIntoView(parentScrollbox, element) {
    // Make sure that element is inside the visible part of parentScrollbox by
    // adjusting the scroll position of parentScrollbox. If element is wider or
    // higher than the scroll port, the left and top edges are prioritized over
    // the right and bottom edges.

    // We can't use getBoundingClientRect() on the parentScrollbox because that
    // would give us the outer size of the scrollbox, and not the actually
    // visible part of the scroll viewport (which might be smaller due to
    // scrollbars). So we use offsetLeft/Top and clientWidth/Height.
    var r = element.getBoundingClientRect();
    var leftCutoff = parentScrollbox.offsetLeft - r.left;
    var rightCutoff = r.right - (parentScrollbox.offsetLeft + parentScrollbox.clientWidth);
    var topCutoff = parentScrollbox.offsetTop - r.top;
    var bottomCutoff = r.bottom - (parentScrollbox.offsetTop + parentScrollbox.clientHeight);
    if (leftCutoff > 0)
      parentScrollbox.scrollLeft -= leftCutoff;
    else if (rightCutoff > 0)
      parentScrollbox.scrollLeft += rightCutoff;
    if (topCutoff > 0)
      parentScrollbox.scrollTop -= topCutoff;
    else if (bottomCutoff > 0)
      parentScrollbox.scrollTop += bottomCutoff;
  },
  _select: function Tree__select(div) {
    if (div.tree.selected != null) {
      div.tree.selected.id = "";
      div.tree.selected.treeLine.className = "unselected";
      div.tree.selected = null;
    }
    if (div) {
      div.id = "selected_treenode";
      div.treeLine.className = "selected";
      div.tree.selected = div;
      var functionName = div.treeLine.querySelector(".functionName");
      Tree.prototype._scrollIntoView(div.tree.root, functionName);
    }
  },
  _selected: function Tree__selected() {
    return document.getElementById("selected_treenode");
  },
  _isCollapsed: function Tree__isCollapsed(div) {
    return div.classList.contains("collapsed");
  },
  _getParentSubtreeContainer: function Tree__getParentSubtreeContainer(node) {
    while (node) {
      if (node.nodeType != node.ELEMENT_NODE)
        break;
      if (node.classList.contains("subtreeContainer"))
        return node;
      node = node.parentNode;
    }
    return null;
  },
  _onclick: function Tree__onclick(event) {
    var target = event.target;
    var node = Tree.prototype._getParentSubtreeContainer(target);
    if (!node)
      return;
    if (target.classList.contains("expandCollapseButton")) {
      if (event.altKey)
        Tree.prototype._toggleAll(node);
      else
        Tree.prototype._toggle(node);
    } else {
      Tree.prototype._select(node);
      if (event.detail == 2) // dblclick
        Tree.prototype._toggle(node);
    }
  },
  _onkeypress: function Tree__onkeypress(event) {
    var selected = Tree.prototype._selected();
    if (event.keyCode < 37 || event.keyCode > 40) {
      if (event.keyCode != 0 ||
          String.fromCharCode(event.charCode) != '*') {
        return;
      }
    }
    event.stopPropagation();
    event.preventDefault();
    if (selected == null) return false;
    if (event.keyCode == 37) { // KEY_LEFT
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (!isCollapsed) {
        Tree.prototype._toggle(selected);
      } else {
        var parent = Tree.prototype._getParent(selected); 
        if (parent != null) {
          Tree.prototype._select(parent);
        }
      }
    } else if (event.keyCode == 38) { // KEY_UP
      var prevSib = Tree.prototype._getPrevSib(selected);
      var parent = Tree.prototype._getParent(selected); 
      if (prevSib != null) {
        Tree.prototype._select(Tree.prototype._getLastChild(prevSib));
      } else if (parent != null) {
        Tree.prototype._select(parent);
      }
    } else if (event.keyCode == 39) { // KEY_RIGHT
      var isCollapsed = Tree.prototype._isCollapsed(selected);
      if (isCollapsed) {
        Tree.prototype._toggle(selected);
      }
    } else if (event.keyCode == 40) { // KEY_DOWN
      var nextSib = Tree.prototype._getNextSib(selected);
      var child = Tree.prototype._getFirstChild(selected); 
      if (child != null) {
        Tree.prototype._select(child);
      } else if (nextSib) {
        Tree.prototype._select(nextSib);
      }
    } else if (String.fromCharCode(event.charCode) == '*') {
      Tree.prototype._toggleAll(selected);
    }
    return false;
  },
};

