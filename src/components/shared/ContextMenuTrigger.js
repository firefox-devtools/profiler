// @flow

import React, { PureComponent } from 'react';
import { ContextMenuTrigger } from 'react-contextmenu';

export default class MyContextMenuTrigger extends PureComponent<{}> {
  render() {
    return <ContextMenuTrigger holdToDisplay={-1} {...this.props} />;
  }
}
