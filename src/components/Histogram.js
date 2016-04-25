import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import shallowCompare from 'react-addons-shallow-compare';
import { getCallTree } from '../profile-tree';
import { timeCode } from '../time-code';

class Histogram extends Component {

  constructor(props) {
    super(props);
    this._resizeListener = e => this.forceUpdate();
  }

  shouldComponentUpdate(nextProps, nextState) {
    return shallowCompare(this, nextProps, nextState);
  }

  componentDidMount() {
    const win = this.refs.canvas.ownerDocument.defaultView;
    win.addEventListener('resize', this._resizeListener);
    this.forceUpdate(); // for initial size
  }

  componentWillUnmount() {
    const win = this.refs.canvas.ownerDocument.defaultView;
    win.removeEventListener('resize', this._resizeListener);
  }

  drawCanvas(c) {
    const { thread, interval, rangeStart, rangeEnd, funcStackInfo, selectedFuncStack } = this.props;

    const devicePixelRatio = c.ownerDocument ? c.ownerDocument.defaultView.devicePixelRatio : 1;
    const r = c.getBoundingClientRect();
    c.width = Math.round(r.width * devicePixelRatio);
    c.height = Math.round(r.height * devicePixelRatio);
    const ctx = c.getContext('2d');
    let maxDepth = 0;
    const { funcStackTable, sampleFuncStacks } = funcStackInfo;
    for (let i = 0; i < funcStackTable.depth.length; i++) {
      if (funcStackTable.depth[i] > maxDepth) {
        maxDepth = funcStackTable.depth[i];
      }
    }
    const range = [rangeStart, rangeEnd];
    const rangeLength = range[1] - range[0];
    const xPixelsPerMs = c.width / rangeLength;
    const yPixelsPerDepth = c.height / maxDepth;
    const intervalMs = interval * 1.5;
    let selectedFuncStackDepth = 0;
    if (selectedFuncStack !== -1 && selectedFuncStack !== null) {
      selectedFuncStackDepth = funcStackTable.depth[selectedFuncStack];
    }
    function hasSelectedFuncStackPrefix(funcStack) {
      let depth = funcStackTable.depth[funcStack];
      while (depth > selectedFuncStackDepth) {
        funcStack = funcStackTable.prefix[funcStack];
        depth--;
      }
      return funcStack === selectedFuncStack;
    }
    for (let i = 0; i < sampleFuncStacks.length; i++) {
      const sampleTime = thread.samples.time[i];
      if (sampleTime + intervalMs < range[0] || sampleTime > range[1])
        continue;
      const funcStack = sampleFuncStacks[i];
      const isHighlighted = hasSelectedFuncStackPrefix(funcStack);
      const sampleHeight = funcStackTable.depth[funcStack] * yPixelsPerDepth;
      const startY = c.height - sampleHeight;
      const responsiveness = thread.samples.responsiveness[i];
      const jankSeverity = Math.min(1, responsiveness / 100);
      ctx.fillStyle = `rgb(${Math.round(255 * jankSeverity)}, ${isHighlighted ? 255 : 0}, 0)`;
      ctx.fillRect((sampleTime - range[0]) * xPixelsPerMs, startY, intervalMs * xPixelsPerMs, sampleHeight);
    }

  }

  render() {
    if (this.refs.canvas) {
      timeCode('histogram render', () => {
        this.drawCanvas(this.refs.canvas);
      });
    }
    return <canvas className={this.props.className} ref='canvas'/>;
  }

}
export default Histogram;
