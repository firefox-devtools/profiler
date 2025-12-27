/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Provider } from 'react-redux';

import {
  render,
  fireEvent,
  screen,
  act,
} from 'firefox-profiler/test/fixtures/testing-library';
import { FilterNavigatorBar } from 'firefox-profiler/components/shared/FilterNavigatorBar';
import { ProfileFilterNavigator } from '../../components/app/ProfileFilterNavigator';
import * as ProfileView from '../../actions/profile-view';
import { storeWithProfile } from '../fixtures/stores';
import { getProfileFromTextSamples } from '../fixtures/profiles/processed-profile';
import { ensureExists } from '../../utils/types';

describe('shared/FilterNavigatorBar', () => {
  it(`pops the item unless the last one is clicked`, () => {
    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        onPop={onPop}
      />
    );

    // We don't use getByRole because this isn't a button.
    const lastElement = screen.getByText('bar');
    fireEvent.click(lastElement);
    expect(onPop).not.toHaveBeenCalled();

    const firstElement = screen.getByRole('button', { name: 'foo' });
    fireEvent.click(firstElement);
    expect(onPop).toHaveBeenCalledWith(0);
  });

  it(`pops the last item if there's an uncommited item`, () => {
    const onPop = jest.fn();
    render(
      <FilterNavigatorBar
        className=""
        items={['foo', 'bar']}
        selectedItem={2}
        uncommittedItem="baz"
        onPop={onPop}
      />
    );

    // We don't use getByRole because this isn't a button.
    const lastElement = screen.getByText('bar');
    fireEvent.click(lastElement);
    expect(onPop).toHaveBeenCalledWith(1);
  });

  it(`updates the preview selection when duration is modified`, () => {
    const onPop = jest.fn();
    const updatePreviewSelection = jest.fn();
    const committedRange = {
      start: 1000,
      end: 3000,
    };
    const previewSelection = {
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 1060,
    };

    render(
      <FilterNavigatorBar
        className=""
        items={['100ms']}
        selectedItem={1}
        uncommittedItem="10ms"
        onPop={onPop}
        committedRange={committedRange}
        previewSelection={previewSelection}
        updatePreviewSelection={updatePreviewSelection}
      />
    );

    const uncommittedItem = screen.getByDisplayValue('10ms');

    // Setting a valid value should update.
    fireEvent.change(uncommittedItem, {
      target: { value: '20ms' },
    });
    expect(updatePreviewSelection).toHaveBeenCalledWith({
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 1070,
    });

    fireEvent.change(uncommittedItem, {
      target: { value: '20.5ms' },
    });
    expect(updatePreviewSelection).toHaveBeenCalledWith({
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 1070.5,
    });

    fireEvent.change(uncommittedItem, {
      target: { value: '500us' },
    });
    expect(updatePreviewSelection).toHaveBeenCalledWith({
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 1050.5,
    });

    fireEvent.change(uncommittedItem, {
      target: { value: '1.5s' },
    });
    expect(updatePreviewSelection).toHaveBeenCalledWith({
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 2550,
    });

    // The selectionEnd should not exceed the committedRange.
    fireEvent.change(uncommittedItem, {
      target: { value: '200s' },
    });
    expect(updatePreviewSelection).toHaveBeenCalledWith({
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 3000,
    });
  });

  it(`commits the range when duration is submitted`, () => {
    const onPop = jest.fn();
    const commitRange = jest.fn();
    const previewSelection = {
      isModifying: false,
      selectionStart: 1050,
      selectionEnd: 1060,
    };

    render(
      <FilterNavigatorBar
        className=""
        items={['100ms']}
        selectedItem={1}
        uncommittedItem="10ms"
        onPop={onPop}
        previewSelection={previewSelection}
        commitRange={commitRange}
        zeroAt={0}
      />
    );

    const uncommittedItem = screen.getByDisplayValue('10ms');

    fireEvent.submit(uncommittedItem, {});
    expect(commitRange).toHaveBeenCalledWith(1050, 1060);
  });
});

describe('app/ProfileFilterNavigator', () => {
  const tabID = 123123;
  function setup() {
    const { profile } = getProfileFromTextSamples(`
      A  A  A
      B  B  B
      C  C  H
      D  F  I
      E  G
      `);
    profile.pages = [
      {
        tabID: tabID,
        innerWindowID: 1,
        url: 'https://developer.mozilla.org/en-US/',
        embedderInnerWindowID: 0,
      },
    ];
    profile.meta.configuration = {
      threads: [],
      features: [],
      capacity: 1000000,
      activeTabID: tabID,
    };

    // Change the root range for testing.
    const samples = profile.threads[0].samples;
    ensureExists(samples.time)[samples.length - 1] = 50;

    const store = storeWithProfile(profile);
    const renderResult = render(
      <Provider store={store}>
        <ProfileFilterNavigator />
      </Provider>
    );

    return {
      ...store,
      ...renderResult,
    };
  }

  it('renders ProfileFilterNavigator properly', () => {
    const { container, dispatch } = setup();
    // Just root range
    expect(container.firstChild).toMatchSnapshot();

    // With committed range
    act(() => {
      dispatch(ProfileView.commitRange(0, 40));
    });
    expect(container.firstChild).toMatchSnapshot();

    // With preview selection
    act(() => {
      dispatch(
        ProfileView.updatePreviewSelection({
          isModifying: false,
          selectionStart: 10,
          selectionEnd: 10.1,
        })
      );
    });
    expect(container.firstChild).toMatchSnapshot();
  });

  it('displays the "Full Range" text as its first element', () => {
    const { getByText } = setup();
    expect(getByText(/Full Range/)).toBeInTheDocument();
  });
});
