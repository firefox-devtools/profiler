/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow
import React from 'react';
import ReactDOM from 'react-dom';
import CompactableListWithRemoveButton from '../../components/shared/CompactableListWithRemoveButton';
import renderer from 'react-test-renderer';

// For the react-transition-group component
ReactDOM.findDOMNode = jest.fn(() => ({ className: '' }));

describe('shared/CompactableListWithRemoveButton', function() {
  const introductions = ['', 'Some introduction'];
  introductions.forEach(showIntroduction => {
    describe(`with showIntroduction set to '${showIntroduction}'`, function() {
      it('renders compact and full lists with various elements', function() {
        const list = renderer.create(
          <CompactableListWithRemoveButton
            className="some-class"
            compact={true}
            items={['foo', 'bar']}
            buttonTitle="button title"
            showIntroduction={showIntroduction}
            onItemRemove={() => {}}
          />
        );
        expect(list).toMatchSnapshot();

        list.update(
          <CompactableListWithRemoveButton
            className="some-class"
            compact={false}
            items={['foo', 'bar']}
            buttonTitle="button title"
            showIntroduction={showIntroduction}
            onItemRemove={() => {}}
          />
        );
        expect(list).toMatchSnapshot();

        list.update(
          <CompactableListWithRemoveButton
            className="some-class"
            compact={false}
            items={['foo', 'bar', 'hello']}
            buttonTitle="button title"
            showIntroduction={showIntroduction}
            onItemRemove={() => {}}
          />
        );
        expect(list).toMatchSnapshot();

        list.update(
          <CompactableListWithRemoveButton
            className="some-class"
            compact={false}
            items={[]}
            buttonTitle="button title"
            showIntroduction={showIntroduction}
            onItemRemove={() => {}}
          />
        );
        expect(list).toMatchSnapshot();

        list.update(
          <CompactableListWithRemoveButton
            className="some-class"
            compact={false}
            items={[]}
            buttonTitle="button title"
            showIntroduction={showIntroduction}
            onItemRemove={() => {}}
          />
        );
        expect(list).toMatchSnapshot();
      });
    });
  });
});
