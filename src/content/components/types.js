// @flow
import type { Component } from 'react';

export type Column = {
  propName: string,
  title: string,
  component?: Class<Component<*, *, *>>,
};

