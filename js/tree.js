var kMaxChunkDuration = 4; // ms

function TreeView() {
  this._eventListeners = {};
  this._pendingActions = [];
  this._pendingActionsProcessingCallback = null;

  this._container = document.createElement("div");
  this._container.className = "treeViewContainer";
  this._container.setAttribute("tabindex", "0"); // make it focusable

  this._header = document.createElement("ul");
  this._header.className = "treeHeader";
  this._container.appendChild(this._header);

  this._verticalScrollbox = document.createElement("div");
  this._verticalScrollbox.className = "treeViewVerticalScrollbox";
  this._container.appendChild(this._verticalScrollbox);

  this._leftColumnBackground = document.createElement("div");
  this._leftColumnBackground.className = "leftColumnBackground";
  this._verticalScrollbox.appendChild(this._leftColumnBackground);

  this._horizontalScrollbox = document.createElement("ol");
  this._horizontalScrollbox.className = "treeViewHorizontalScrollbox";
  this._verticalScrollbox.appendChild(this._horizontalScrollbox);

  var self = this;
  this._container.onkeypress = function (e) {
    self._onkeypress(e);
  };
  this._container.onclick = function (e) {
    self._onclick(e);
  };
  this._verticalScrollbox.addEventListener("contextmenu", function(event) {
    self._contextMenu(event);
  }, true);
  this._setUpScrolling();
};

TreeView.prototype = {
  getContainer: function TreeView_getContainer() {
    return this._container;
  },
  setColumns: function TreeView_setColumns(columns) {
    this._header.innerHTML = "";
    for (var i = 0; i < columns.length; i++) {
      var li = document.createElement("li");
      li.className = "treeColumnHeader treeColumnHeader" + i;
      li.id = columns[i].name + "Header";
      li.textContent = columns[i].title;
      this._header.appendChild(li);
    }
  },
  display: function TreeView_display(data) {
    this._horizontalScrollbox.innerHTML = "";
    if (this._pendingActionsProcessingCallback) {
      window.mozCancelAnimationFrame(this._pendingActionsProcessingCallback);
    }
    this._pendingActions = [];

    this._pendingActions.push({
      parentElement: this._horizontalScrollbox,
      parentNode: null,
      data: data[0].getData()
    });
    this._processPendingActions();
    this._select(this._horizontalScrollbox.firstChild);
    this._toggle(this._horizontalScrollbox.firstChild);
    this._container.focus();
  },
  _processPendingActions: function TreeView__processPendingActions() {
    var startTime = Date.now();
    var endTime = startTime + kMaxChunkDuration;
    while (Date.now() < endTime && this._pendingActions.length > 0) {
      this._processOneAction(this._pendingActions.shift());
    }

    if (this._pendingActions.length > 0) {
      var self = this;
      this._pendingActionsProcessingCallback = window.mozRequestAnimationFrame(function () {
        self._processPendingActions();
      })
    }
  },
  _processOneAction: function TreeView__processOneAction(action) {
    this._createTree(action.parentElement, action.parentNode, action.data);
  },
  addEventListener: function TreeView_addEventListener(eventName, callbackFunction) {
    if (!(eventName in this._eventListeners))
      this._eventListeners[eventName] = [];
    if (this._eventListeners[eventName].indexOf(callbackFunction) != -1)
      return;
    this._eventListeners[eventName].push(callbackFunction);
  },
  removeEventListener: function TreeView_removeEventListener(eventName, callbackFunction) {
    if (!(eventName in this._eventListeners))
      return;
    var index = this._eventListeners[eventName].indexOf(callbackFunction);
    if (index == -1)
      return;
    this._eventListeners[eventName].splice(index, 1);
  },
  _fireEvent: function TreeView__fireEvent(eventName, eventObject) {
    if (!(eventName in this._eventListeners))
      return;
    this._eventListeners[eventName].forEach(function (callbackFunction) {
      callbackFunction(eventObject);
    });
  },
  _setUpScrolling: function TreeView__setUpScrolling() {
    var waitingForPaint = false;
    var accumulatedDeltaX = 0;
    var accumulatedDeltaY = 0;
    var self = this;
    function scrollListener(e) {
      if (!waitingForPaint) {
        window.mozRequestAnimationFrame(function () {
          self._horizontalScrollbox.scrollLeft += accumulatedDeltaX;
          self._verticalScrollbox.scrollTop += accumulatedDeltaY;
          accumulatedDeltaX = 0;
          accumulatedDeltaY = 0;
          waitingForPaint = false;
        });
        waitingForPaint = true;
      }
      if (e.axis == e.HORIZONTAL_AXIS) {
        accumulatedDeltaX += e.detail;
      } else {
        accumulatedDeltaY += e.detail;
      }
      e.preventDefault();
    }
    this._verticalScrollbox.addEventListener("MozMousePixelScroll", scrollListener, false);
    this._verticalScrollbox.cleanUp = function () {
      self._verticalScrollbox.removeEventListener("MozMousePixelScroll", scrollListener, false);
    };
  },
  _scrollHeightChanged: function TreeView__scrollHeightChanged() {
    this._leftColumnBackground.style.height = this._horizontalScrollbox.getBoundingClientRect().height + 'px';
  },
  _createTree: function TreeView__createTree(parentElement, parentNode, data) {
    var li = document.createElement("li");
    li.className = "treeViewNode collapsed";
    var hasChildren = ("children" in data) && (data.children.length > 0);
    if (!hasChildren)
      li.classList.add("leaf");
    var treeLine = document.createElement("div");
    treeLine.className = "treeLine";
    treeLine.innerHTML = this._HTMLForFunction(data);
    // When this item is toggled we will expand its children
    li.pendingExpand = [];
    li.treeLine = treeLine;
    li.data = data;
    li.appendChild(treeLine);
    li.treeChildren = [];
    li.treeParent = parentNode;
    if (hasChildren) {
      var ol = document.createElement("ol");
      ol.className = "treeViewNodeList";
      for (var i = 0; i < data.children.length; ++i) {
        li.pendingExpand.push({parentElement: ol, parentNode: li, data: data.children[i].getData() });
      }
      li.appendChild(ol);
    }
    if (parentNode) {
      parentNode.treeChildren.push(li);
    }
    parentElement.appendChild(li);
  },
  _contextMenu: function TreeView__contextMenu(event) {
    this._verticalScrollbox.setAttribute("contextmenu", "");

    var target = event.target;
    if (target.classList.contains("expandCollapseButton"))
      return;

    var li = this._getParentTreeViewNode(target);
    if (!li)
      return;

    this._select(li);

    var contextMenu = document.getElementById("xulContextMenu");
    contextMenu.innerHTML = "";

    var menuItems = this._contextMenuForFunction(li.data);
    for (var i = 0; i < menuItems.length; i++) {
      var menuItem = menuItems[i];
      var menuItemNode = document.createElement("menuitem");
      var self = this;
      menuItemNode.onclick = (function (menuItem) {
        return function() {
          self._contextMenuClick(li.data, menuItem);
        };
      })(menuItem);
      menuItemNode.label = menuItem;
      contextMenu.appendChild(menuItemNode);
    }
    this._verticalScrollbox.setAttribute("contextmenu", contextMenu.id);
  },
  _contextMenuClick: function TreeView__ContextMenuClick(node, menuItem) {
    // TODO move me outside tree.js
    if (menuItem == "View Source") {
      // Remove anything after ( since MXR doesn't handle search with the arguments.
      var symbol = node.name.split("(")[0];
      window.open("http://mxr.mozilla.org/mozilla-central/search?string=" + symbol, "View Source");
    } else if (menuItem == "Google Search") {
      var symbol = node.name;
      window.open("https://www.google.ca/search?q=" + symbol, "View Source");
    } else if (menuItem == "Focus") {
      var symbol = node.name;
      focusOnSymbol(symbol);
    }
  },
  _contextMenuForFunction: function TreeView__contextMenuForFunction(node) {
    // TODO move me outside tree.js
    var menu = [];
    if (node.library != null && node.library.toLowerCase() == "xul") {
      menu.push("View Source");
    }
    menu.push("Focus");
    menu.push("Google Search");
    return menu;
  },
  _HTMLForFunction: function TreeView__HTMLForFunction(node) {
    return '<input type="button" value="Expand / Collapse" class="expandCollapseButton" tabindex="-1"> ' +
      '<span class="sampleCount">' + node.counter + '</span> ' +
      '<span class="samplePercentage">' + (100 * node.ratio).toFixed(1) + '%</span> ' +
      '<span class="selfSampleCount">' + node.selfCounter + '</span> ' +
      '<span class="functionName">' + node.name + '</span>' +
      '<span class="libraryName">' + node.library + '</span>';
  },
  _resolveChildren: function TreeView__resolveChildren(div) {
    while (div.pendingExpand != null && div.pendingExpand.length > 0) {
      this._processOneAction(div.pendingExpand.shift());
    }
  },
  _toggle: function TreeView__toggle(div, /* optional */ newCollapsedValue, /* optional */ suppressScrollHeightNotification) {
    this._resolveChildren(div);
    if (newCollapsedValue === undefined) {
      div.classList.toggle("collapsed");
    } else {
      if (newCollapsedValue)
        div.classList.add("collapsed");
      else
        div.classList.remove("collapsed");
    }
    if (!suppressScrollHeightNotification)
      this._scrollHeightChanged();
  },
  _toggleAll: function TreeView__toggleAll(subtreeRoot, /* optional */ newCollapsedValue, /* optional */ suppressScrollHeightNotification) {
    // Expands / collapses all child nodes, too.
    if (newCollapsedValue === undefined)
      newCollapsedValue = !this._isCollapsed(subtreeRoot);
    this._toggle(subtreeRoot, newCollapsedValue);
    for (var i = 0; i < subtreeRoot.treeChildren.length; ++i) {
      this._toggleAll(subtreeRoot.treeChildren[i], newCollapsedValue, true);
    }
    if (!suppressScrollHeightNotification)
      this._scrollHeightChanged();
  },
  _getParent: function TreeView__getParent(div) {
    return div.treeParent;
  },
  _getFirstChild: function TreeView__getFirstChild(div) {
    if (this._isCollapsed(div))
      return null;
    var child = div.treeChildren[0];
    return child;
  },
  _getLastChild: function TreeView__getLastChild(div) {
    if (this._isCollapsed(div))
      return div;
    var lastChild = div.treeChildren[div.treeChildren.length-1];
    if (lastChild == null)
      return div;
    return this._getLastChild(lastChild);
  },
  _getPrevSib: function TreeView__getPevSib(div) {
    if (div.treeParent == null)
      return null;
    var nodeIndex = div.treeParent.treeChildren.indexOf(div);
    if (nodeIndex == 0)
      return null;
    return div.treeParent.treeChildren[nodeIndex-1];
  },
  _getNextSib: function TreeView__getNextSib(div) {
    if (div.treeParent == null)
      return null;
    var nodeIndex = div.treeParent.treeChildren.indexOf(div);
    if (nodeIndex == div.treeParent.treeChildren.length - 1)
      return this._getNextSib(div.treeParent);
    return div.treeParent.treeChildren[nodeIndex+1];
  },
  _scrollIntoView: function TreeView__scrollIntoView(element, maxImportantWidth) {
    // Make sure that element is inside the visible part of our scrollbox by
    // adjusting the scroll positions. If element is wider or
    // higher than the scroll port, the left and top edges are prioritized over
    // the right and bottom edges.
    // If maxImportantWidth is set, parts of the beyond this widths are
    // considered as not important; they'll not be moved into view.

    if (maxImportantWidth === undefined)
      maxImportantWidth = Infinity;

    var visibleRect = {
      left: this._horizontalScrollbox.getBoundingClientRect().left + 150, // TODO: un-hardcode 150
      top: this._verticalScrollbox.getBoundingClientRect().top,
      right: this._horizontalScrollbox.getBoundingClientRect().right,
      bottom: this._verticalScrollbox.getBoundingClientRect().bottom
    }
    var r = element.getBoundingClientRect();
    var right = Math.min(r.right, r.left + maxImportantWidth);
    var leftCutoff = visibleRect.left - r.left;
    var rightCutoff = right - visibleRect.right;
    var topCutoff = visibleRect.top - r.top;
    var bottomCutoff = r.bottom - visibleRect.bottom;
    if (leftCutoff > 0)
      this._horizontalScrollbox.scrollLeft -= leftCutoff;
    else if (rightCutoff > 0)
      this._horizontalScrollbox.scrollLeft += Math.min(rightCutoff, -leftCutoff);
    if (topCutoff > 0)
      this._verticalScrollbox.scrollTop -= topCutoff;
    else if (bottomCutoff > 0)
      this._verticalScrollbox.scrollTop += Math.min(bottomCutoff, -topCutoff);
  },
  _select: function TreeView__select(li) {
    if (this._selectedNode != null) {
      this._selectedNode.treeLine.classList.remove("selected");
      this._selectedNode = null;
    }
    if (li) {
      li.treeLine.classList.add("selected");
      this._selectedNode = li;
      var functionName = li.treeLine.querySelector(".functionName");
      this._scrollIntoView(functionName, 400);
      this._fireEvent("select", li.data);
    }
  },
  _isCollapsed: function TreeView__isCollapsed(div) {
    return div.classList.contains("collapsed");
  },
  _getParentTreeViewNode: function TreeView__getParentTreeViewNode(node) {
    while (node) {
      if (node.nodeType != node.ELEMENT_NODE)
        break;
      if (node.classList.contains("treeViewNode"))
        return node;
      node = node.parentNode;
    }
    return null;
  },
  _onclick: function TreeView__onclick(event) {
    var target = event.target;
    var node = this._getParentTreeViewNode(target);
    if (!node)
      return;
    if (target.classList.contains("expandCollapseButton")) {
      if (event.altKey)
        this._toggleAll(node);
      else
        this._toggle(node);
    } else {
      this._select(node);
      if (event.detail == 2) // dblclick
        this._toggle(node);
    }
  },
  _onkeypress: function TreeView__onkeypress(event) {
    if (event.ctrlKey || event.altKey || event.metaKey)
      return;

    var selected = this._selectedNode;
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
      var isCollapsed = this._isCollapsed(selected);
      if (!isCollapsed) {
        this._toggle(selected);
      } else {
        var parent = this._getParent(selected); 
        if (parent != null) {
          this._select(parent);
        }
      }
    } else if (event.keyCode == 38) { // KEY_UP
      var prevSib = this._getPrevSib(selected);
      var parent = this._getParent(selected); 
      if (prevSib != null) {
        this._select(this._getLastChild(prevSib));
      } else if (parent != null) {
        this._select(parent);
      }
    } else if (event.keyCode == 39) { // KEY_RIGHT
      var isCollapsed = this._isCollapsed(selected);
      if (isCollapsed) {
        this._toggle(selected);
      }
    } else if (event.keyCode == 40) { // KEY_DOWN
      var nextSib = this._getNextSib(selected);
      var child = this._getFirstChild(selected); 
      if (child != null) {
        this._select(child);
      } else if (nextSib) {
        this._select(nextSib);
      }
    } else if (String.fromCharCode(event.charCode) == '*') {
      this._toggleAll(selected);
    }
    return false;
  },
};

