/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
// @flow

import {
  stripFunctionArguments,
  removeTemplateInformation,
  getFunctionName,
} from '../../profile-logic/function-info';

describe('strip-function-arguments', function() {
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

describe('remove-template-information', function() {
  it('should remove template information', function() {
    expect(
      removeTemplateInformation('ns::Impl<void (ns::foo::*)(), (ns::bar)0>::fn')
    ).toEqual('ns::Impl::fn');
    expect(removeTemplateInformation('fn<ns::foo<ns::bar<a::b> > >')).toEqual(
      'fn'
    );
  });

  it('should not remove information we want to keep', function() {
    expect(removeTemplateInformation('foo/<bar')).toEqual('foo/<bar');
  });

  it('should not remove <script> tags', function() {
    let fixture = '<script async src="something.js">';
    expect(removeTemplateInformation(fixture)).toEqual(fixture);

    fixture = 'starting handling <script>';
    expect(removeTemplateInformation(fixture)).toEqual(fixture);
  });
});

describe('get-function-name', function() {
  it('should get the function name', function() {
    expect(
      getFunctionName('ns::Foo<0>::fn(bool (*)(JS::Handle<JSObject*>)) const')
    ).toEqual('ns::Foo::fn');
  });
});
