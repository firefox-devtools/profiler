/* stolen from the light theme at devtools/client/themes/variables.css */
const themeHighlightGreen = '#2cbb0f';
const themeHighlightBlue = '#0088cc';
const themeHighlightBluegrey = '#0072ab';
const themeHighlightPurple = '#5b5fff';
const themeHighlightOrange = '#f13c00';
const themeHighlightRed = '#ed2655';
const themeHighlightPink = '#b82ee5';
const themeHighlightGray = '#b4babf'; /* except for this one, I made this one darker */

export const styles = {
  default: {
    top: 0,
    height: 6,
    background: 'black',
    squareCorners: false,
    borderLeft: null,
    borderRight: null,
  },
  RefreshDriverTick: {
    background: 'hsla(0,0%,0%,0.05)',
    height: 18,
    squareCorners: true,
  },
  RD: {
    background: 'hsla(0,0%,0%,0.05)',
    height: 18,
    squareCorners: true,
  },
  Scripts: {
    background: themeHighlightOrange,
    top: 6,
  },
  Styles: {
    background: themeHighlightBluegrey,
    top: 7,
  },
  FireScrollEvent: {
    background: themeHighlightOrange,
    top: 7,
  },
  Reflow: {
    background: themeHighlightBlue,
    top: 7,
  },
  DispatchSynthMouseMove: {
    background: themeHighlightOrange,
    top: 8,
  },
  DisplayList: {
    background: themeHighlightPurple,
    top: 9,
  },
  LayerBuilding: {
    background: themeHighlightPink,
    top: 9,
  },
  Rasterize: {
    background: themeHighlightGreen,
    top: 10,
  },
  ForwardTransaction: {
    background: themeHighlightRed,
    top: 11,
  },
  NotifyDidPaint: {
    background: themeHighlightGray,
    top: 12,
  },
  LayerTransaction: {
    background: themeHighlightRed,
  },
  Composite: {
    background: themeHighlightBlue,
  },
  Vsync: {
    background: 'rgb(255, 128, 0)',
  },
  LayerContentGPU: {
    background: 'rgba(0,200,0,0.5)',
  },
  LayerCompositorGPU: {
    background: 'rgba(0,200,0,0.5)',
  },
  LayerOther: {
    background: 'rgb(200,0,0)',
  },
  Jank: {
    background: 'hsl(0,90%,70%)',
    borderLeft: 'hsl(0,90%,50%)',
    borderRight: 'hsl(0,90%,50%)',
    squareCorners: true,
  },
};

for (const name in styles) {
  if (name !== 'default') {
    styles[name] = Object.assign({}, styles.default, styles[name]);
  }
}

export const overlayFills = {
  HOVERED: 'hsla(0,0%,100%,0.3)',
  PRESSED: 'rgba(0,0,0,0.3)',
};
