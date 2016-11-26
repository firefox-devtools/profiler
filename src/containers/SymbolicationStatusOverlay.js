import React, { Component, PropTypes } from 'react';
import { connect } from 'react-redux';
import * as actions from '../actions';
import { getProfileViewOptions } from '../selectors/';

function englishListJoin(list) {
  switch (list.length) {
    case 0:
      return '';
    case 1:
      return list[0];
    default: {
      const allButLast = list.slice(0, list.length - 1);
      return allButLast.join(', ') + ' and ' + list[list.lenth - 1];
    }
  }
}

class SymbolicationStatusOverlay extends Component {
  render() {
    const { viewOptions } = this.props;
    const { symbolicationStatus, waitingForLibs } = viewOptions;
    if (symbolicationStatus === 'SYMBOLICATING') {
      if (waitingForLibs.size > 0) {
        const libNames = Array.from(waitingForLibs.values()).map(lib => lib.pdbName);
        return (
          <div className='symbolicationStatusOverlay'>
            <span className='symbolicationStatusOverlayThrobber'></span>
            {`Waiting for symbol tables for ${englishListJoin(libNames)}...`}
          </div>
        );
      }
      return (
        <div className='symbolicationStatusOverlay'>
          <span className='symbolicationStatusOverlayThrobber'></span>
          {`Symbolicating call stacks...`}
        </div>
      );
    }
    return (
      <div className='symbolicationStatusOverlay hidden'></div>
    );
  }
}

SymbolicationStatusOverlay.propTypes = {
  viewOptions: PropTypes.object.isRequired,
};

export default connect((state, props) => ({
  viewOptions: getProfileViewOptions(state, props),
}), actions)(SymbolicationStatusOverlay);
