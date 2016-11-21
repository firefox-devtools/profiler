import React, { Component, PropTypes } from 'react';

const HEIGHT = 30;
const STROKE = 3;
const HALF_STROKE = STROKE / 2;

export default class SummarizeLineGraph extends Component {
  componentDidMount() {
    const resize = () => this.updateWidth();
    window.addEventListener('resize', resize);
    this.setState({resize});
    this.updateWidth();
  }

  componentWillUnmount() {
    window.removeEventListener('resize', this.state.resize);
  }

  componentWillReceiveProps(props) {
    this.updateWidth(props);
  }

  updateWidth(props = this.props) {
    if (!props.rollingSummary) {
      return;
    }
    const {rollingSummary, category} = props;
    const width = this.el.offsetWidth;
    const height = HEIGHT - STROKE;

    // Map the summary data to points inside the SVG, adjust the positioning so the
    // stroke does not fall out of the box at the top and bottom.
    const pointsInSvg = rollingSummary.map(({percentage}, i) => ([
      width * (i / (rollingSummary.length - 1)),
      HALF_STROKE + height * (1 - (percentage[category] || 0)),
    ]));

    // Filter out any summaries that have 0 samples.
    const points = pointsInSvg.filter((points, i) => {
      const {samples} = rollingSummary[i];
      for (const key in samples) {
        if (samples.hasOwnProperty(key)) {
          if (samples[key] > 0) {
            return true;
          }
        }
      }
      return false;
    });

    // Gradients are set by the bounding box, so draw a line from the top of the box
    // to the bottom to make sure the gradient is applied correctly to the line.
    const initialLine = moveTo(-10, 0) + lineTo(-10, HEIGHT);

    // Reduce the points into a single "d" attribute for an SVG path.
    // https://developer.mozilla.org/en-US/docs/Web/SVG/Attribute/d
    const dAttribute = points.reduce((text, [x, y], i) => {
      const draw = i === 0 ? moveTo : lineTo;
      return text + draw(round(x), round(y));
    }, initialLine);

    this.setState({ width, dAttribute });
  }

  renderGradient() {
    return this.props.category === 'idle'
      ? (
        <linearGradient id={'summarize-line-graph-gradient-idle'} x1='0%' y1='0%' x2='0%' y2='100%'>
          <stop offset='0%' stopColor='rgba(200, 249, 131, 0)'/>
          <stop offset='50%' stopColor='#c8f983'/>
          <stop offset='75%' stopColor='#56b300'/>
          <stop offset='100%' stopColor='#e11800'/>
        </linearGradient>
      )
      : (
        <linearGradient id={'summarize-line-graph-gradient'} x1='0%' y1='0%' x2='0%' y2='100%'>
          <stop offset='10%' stopColor='#e11800'/> // Red
          <stop offset='60%' stopColor='#56b300'/> // Dark Green
          <stop offset='85%' stopColor='#c8f983'/> // Light Green
          <stop offset='95%' stopColor='rgba(200, 249, 131, 0)'/> // Transparent
        </linearGradient>
      );
  }

  render() {
    return (
      <div className='summarize-line-graph' ref={(el) => { this.el = el; }}>
        {
          this.state && this.props && this.props.rollingSummary
            ? <svg
                style={{width: this.state.width + 'px', height: HEIGHT + 'px'}}
                width={this.state.width}
                height={HEIGHT}>
                <defs>
                    {this.renderGradient()}
                </defs>
                <path
                  d={this.state.dAttribute}
                  stroke={
                    this.props.category === 'idle'
                      ? 'url(#summarize-line-graph-gradient-idle)'
                      : 'url(#summarize-line-graph-gradient)'
                  }
                  strokeWidth={STROKE}
                  fill='none'/>
              </svg>
            : <div
                style={{height: HEIGHT + 'px'}}
                className={`${this.props.isBlank ? '' : 'filler'} summarize-line-graph-filler`}></div>
        }
      </div>
    );
  }
}

SummarizeLineGraph.propTypes = {
  rollingSummary: PropTypes.array,
  category: PropTypes.string,
  isBlank: PropTypes.boolean,
};

function round (n) {
  return Math.round(n * 1000) / 1000;
}

function moveTo (x, y) {
  return `M${x},${y}`;
}

function lineTo (x, y) {
  return `L${x},${y}`;
}
