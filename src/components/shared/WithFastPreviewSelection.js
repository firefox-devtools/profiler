/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import type { FastPreviewSelection } from '../../app-logic/fast-preview-selection';
import type { PreviewSelection } from '../../types/actions';
import type { ExplicitConnectOptions } from '../../utils/connect';

import * as React from 'react';
import {
  getPreviewSelection,
  getFastPreviewSelection,
} from '../../reducers/profile-view';
import explicitConnect from '../../utils/connect';

type ReduxStateProps = {|
  +fastPreviewSelection: FastPreviewSelection | null,
  +slowPreviewSelection: PreviewSelection,
  // ...Plus props that get passed on.
|};

type PropsToInject = {| +previewSelection: PreviewSelection |};

type State = {|
  previewSelection: PreviewSelection,
|};

/**
 * Creates a component that can very quickly handle preview selections. In the call
 * tree we really want previews to slice the information, and recompute the tree.
 * However, in other panels with charts, the preview selection needs to be much faster.
 * In order to deal with these two requirements, this component abstracts out the logic
 * for updating components with either a fast or slow preview selection. The fast
 * preview selection is added to the store most likely in the chart component, this one
 * only reacts to it, and provides a fast preview selection if it exists, if not, it will
 * fall back to the slow one. This strategy allows us to update components and bypass
 * the expense of working with the Redux store.
 */
export function withFastPreviewSelection<
  // Take some arbitrary Wrappee Props.
  WrappeeProps: Object
>(
  // The Wrappee must handle its own props, plus the PropsToInject.
  Wrappee: React.ComponentType<{| ...WrappeeProps, ...PropsToInject |}>
  // Finally, strip out the PropsToInject from the returned component, as this higher
  // order component fulfills the props requirements.
): React.ComponentType<$Diff<WrappeeProps, PropsToInject>> {
  class WithFastPreviewWrapper extends React.PureComponent<*, State> {
    constructor(props: ReduxStateProps) {
      super(props);

      this.state = {
        previewSelection: this._getPreviewSelection(props),
      };
      if (props.fastPreviewSelection !== null) {
        props.fastPreviewSelection.on(
          'update',
          this._handleFastPreviewSelectionChange
        );
      }
    }

    _getPreviewSelection({ slowPreviewSelection, fastPreviewSelection }) {
      return fastPreviewSelection === null
        ? slowPreviewSelection
        : fastPreviewSelection.get();
    }

    _handleFastPreviewSelectionChange = (
      previewSelection: PreviewSelection
    ) => {
      this.setState({ previewSelection });
    };

    /**
     * Keep this component's state up to date with either the slow or the fast value.
     */
    componentWillReceiveProps(nextProps: ReduxStateProps) {
      const nextFastPreviewSelection = nextProps.fastPreviewSelection;
      const nextSlowPreviewSelection = nextProps.slowPreviewSelection;
      const prevFastPreviewSelection = this.props.fastPreviewSelection;
      const prevSlowPreviewSelection = this.props.slowPreviewSelection;

      if (nextFastPreviewSelection === null) {
        // There is no fast preview selection.
        if (prevSlowPreviewSelection !== nextSlowPreviewSelection) {
          // The slow value changed, we need to update the state.
          this.setState({ previewSelection: nextSlowPreviewSelection });
        }
        if (prevFastPreviewSelection !== null) {
          // The previous fast preview selection was removed, clean-up the listener.
          prevFastPreviewSelection.removeListener(
            'update',
            this._handleFastPreviewSelectionChange
          );
        }
      } else {
        // There is a fast preview selection.
        if (prevFastPreviewSelection === null) {
          // A fast preview selection was introduced, subscribe to changes.
          nextFastPreviewSelection.on(
            'update',
            this._handleFastPreviewSelectionChange
          );
          this.setState({
            previewSelection: nextFastPreviewSelection.get(),
          });
        }
      }
    }

    componentWillUnmount() {
      const { fastPreviewSelection } = (this.props: ReduxStateProps);
      if (fastPreviewSelection !== null) {
        fastPreviewSelection.removeListener(
          'change',
          this._handleFastPreviewSelectionChange
        );
      }
    }

    render() {
      // console.log('!!! render WithFastPreviewSelection', {
      //   previewSelection: (this.state.previewSelection: Object).selectionStart,
      //   fast:
      //     this.props.fastPreviewSelection &&
      //     this.props.fastPreviewSelection.get().selectionStart,
      //   slow: this.props.slowPreviewSelection.selectionStart,
      // });
      return (
        <Wrappee
          {...this.props}
          previewSelection={this.state.previewSelection}
        />
      );
    }
  }

  const options: ExplicitConnectOptions<WrappeeProps, ReduxStateProps, {||}> = {
    mapStateToProps: state => ({
      slowPreviewSelection: getPreviewSelection(state),
      fastPreviewSelection: getFastPreviewSelection(state),
    }),
    component: WithFastPreviewWrapper,
  };
  return explicitConnect(options);
}
