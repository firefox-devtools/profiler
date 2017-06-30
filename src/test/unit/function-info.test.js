/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { stripFunctionArguments } from '../../profile-logic/function-info';

describe('get-function-name', function() {
  it('should strip the function arguments', function() {
    expect(stripFunctionArguments('ns::fn()')).toEqual('ns::fn');
    expect(
      stripFunctionArguments('ns::fn(bool (*)(JS::Handle<JSObject*>))')
    ).toEqual('ns::fn');
    expect(
      stripFunctionArguments('Bar* ns::fn<(Foo)0>(void const*, unsigned int)')
    ).toEqual('Bar* ns::fn<(Foo)0>');
    expect(
      stripFunctionArguments('ns::fn(bool, bool) [clone .part.123]')
    ).toEqual('ns::fn');
    expect(stripFunctionArguments('ns::fn() const')).toEqual('ns::fn');
    expect(stripFunctionArguments('ns::fn() const [clone .part.123]')).toEqual(
      'ns::fn'
    );
  });
  it('should do nothing if not ending with parentheses', function() {
    expect(stripFunctionArguments('ns::fn [clone .part.123]')).toEqual(
      'ns::fn [clone .part.123]'
    );
  });
  it('should do nothing if not a function call', function() {
    expect(stripFunctionArguments('(root)')).toEqual('(root)');
  });
});
