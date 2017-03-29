// from https://gist.github.com/jviereck/9a71734afcfe848ddbe2 -- fixed
import React from 'react';

// EXAMPLE:
//
// var ExampleComponent = React.createClass({
//   render(): any {
//     // Define the CSS content used by this component.
//     var styleContent = `
//       .chunkTitle {
//         background: lightgray;
//         margin-bottom: 4px;
//         padding: 2px;
//       }`;

//     // By using a <StyleDef content="cssContent" /> the CSS definitions get
//     // added within an <style>cssContent</style> in the header of the page.
//     return (
//       <div className="chunkTitle">
//         <StyleDef content={styleContent} />
//         ContentGoesHere.
//       </div>
//     );
//   }
// });

// Way to define CSS styles in React components that appear as real <styles>
// on the page instead of using the `styles` property.
// Defining the CSS string directly inside of a <style> tag does not work as
// the parser used by babel.js rejects CSS text like "2px" as invalid JS. Also,
// the placeholder like `{someVar}` causes problems with the usage of brakets
// in a CSS definition like `.class { color: red }`, where the content between
// the brackets should not be replaced by a variable.
// The CSS content is defined with the helf of a react component <StyleDef />
// where the actual CSS content is defined as the `content="..."` property.
// Instead of creating a <style> element on the page per <StyleDef /> component,
// only one <style> element per unique CSS content is created. Reference counting
// is used to determine if the CSS content is no longer used in th app and the
// corresponding <style> can be removed from the page again.

// List of all the physical styles currently mounted in the document's <head>.
const mountedDomStyles = [];

function DOMStyle(content) {
  this.content = content;
  this.refCounter = 1;

  // Create the actual style element and mount it in the document's <head>.
  this.dom = document.createElement('style');
  this.dom.textContent = content;
  document.head.appendChild(this.dom);
}

function incrStyleContent(content) {
  for (let i = 0; i < mountedDomStyles.length; i++) {
    if (mountedDomStyles[i].content === content) {
      mountedDomStyles[i].refCounter += 1;
      return;
    }
  }
  mountedDomStyles.push(new DOMStyle(content));
}

function decrStyleContent(content) {
  for (let i = 0; i < mountedDomStyles.length; i++) {
    if (mountedDomStyles[i] === content) {
      if ((mountedDomStyles[i].refCounter -= 1) === 0) {
        document.head.remove(mountedDomStyles[i].dom);
        mountedDomStyles.splice(i, 1);
        return;
      }
    }
  }
}

export default class StyleDef extends React.PureComponent {
  componentDidMount() {
    incrStyleContent(this.props.content);
  }

  componentDidUpdate(prevProps) {
    if (prevProps.content !== this.props.content) {
      decrStyleContent(prevProps.content);
      incrStyleContent(this.props.content);
    }
  }

  componentWillUnmount() {
    decrStyleContent(this.props.content);
  }

  render() {
    // The <StyleDef> itself should not appear in the DOM.
    return null;
  }
}

StyleDef.propTypes = {
  content: React.PropTypes.string.isRequired,
};
