/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

import React from 'react';

import LongestMarkers from './LongestMarkers';

import './View360.css';

export default function View360(_props: {||}) {
  return (
    <section className="view360">
      <div className="view360-overview">
        <LongestMarkers />
      </div>
      <div className="view360-details" />
    </section>
  );
}
