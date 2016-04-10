import { assert } from 'chai';
import { getContainingLibrary, symbolicateProfile } from '../src/symbolication';
import { preprocessProfile, resourceTypes } from '../src/merge-profiles';
import exampleProfile from './example-profile';
import { UniqueStringArray } from '../src/unique-string-array';
import { FakeSymbolStore } from './fake-symbol-store';

describe('unique-string-array', function () {
  const u = new UniqueStringArray(['foo', 'bar', 'baz']);
  it('should return the right strings', function () {
    assert.equal(u.getString(0), 'foo');
    assert.equal(u.getString(1), 'bar');
    assert.equal(u.getString(2), 'baz');
  });
  it('should return the correct index for existing strings', function () {
    assert.equal(u.indexForString('foo'), 0);
    assert.equal(u.indexForString('bar'), 1);
    assert.equal(u.indexForString('baz'), 2);
  });
  it('should return a new index for a new string', function () {
    assert.equal(u.indexForString('qux'), 3);
    assert.equal(u.indexForString('qux'), 3);
    assert.equal(u.indexForString('hello'), 4);
    assert.equal(u.indexForString('bar'), 1);
    assert.equal(u.indexForString('qux'), 3);
    assert.equal(u.getString(3), 'qux');
    assert.equal(u.getString(4), 'hello');
  });
});

describe('merge-profiles', function () {
  describe('preprocessProfile', function () {
    const profile = preprocessProfile(exampleProfile);
    it('should have three threads', function () {
      assert.equal(profile.threads.length, 3);
    });
    it('should not have a profile-wide libs property', function () {
      assert.notProperty(profile, 'libs');
    });
    it('should have threads that are objects of the right shape', function () {
      for (let thread of profile.threads) {
        assert.equal(typeof thread, 'object');
        assert.property(thread, 'libs');
        assert.property(thread, 'samples');
        assert.property(thread, 'stackTable');
        assert.property(thread, 'frameTable');
        assert.property(thread, 'markers');
        assert.property(thread, 'stringTable');
        assert.property(thread, 'funcTable');
        assert.property(thread, 'funcStackTable');
        assert.property(thread, 'resourceTable');
      }
    });
    it('should shift the content process by 1 second', function () {
      assert.equal(profile.threads[2].name, 'Content');
      assert.equal(profile.threads[0].samples.data.getValue(0, profile.threads[0].samples.schema.time), 0);
      assert.equal(profile.threads[0].samples.data.getValue(1, profile.threads[0].samples.schema.time), 1);
      assert.equal(profile.threads[2].samples.data.getValue(0, profile.threads[2].samples.schema.time), 1000);
      assert.equal(profile.threads[2].samples.data.getValue(1, profile.threads[2].samples.schema.time), 1001);
      assert.equal(profile.threads[0].markers.data.getValue(0, profile.threads[0].markers.schema.time), 0);
      assert.equal(profile.threads[0].markers.data.getValue(1, profile.threads[0].markers.schema.time), 2);
      assert.equal(profile.threads[2].markers.data.getValue(0, profile.threads[2].markers.schema.time), 1000);
      assert.equal(profile.threads[2].markers.data.getValue(1, profile.threads[2].markers.schema.time), 1002);
      // TODO: also shift the samples inside marker callstacks
    });
    it('should create one function per frame', function () {
      const thread = profile.threads[0];
      assert.equal(thread.frameTable.data.length, 4);
      assert.notProperty(thread.frameTable.schema, 'location');
      assert.property(thread.frameTable.schema, 'func');
      assert.property(thread.funcTable.schema, 'resource');
      assert.equal(thread.funcTable.data.length, 4);
      assert.equal(thread.frameTable.data.getValue(0, thread.frameTable.schema.func), 0);
      assert.equal(thread.frameTable.data.getValue(1, thread.frameTable.schema.func), 1);
      assert.equal(thread.frameTable.data.getValue(2, thread.frameTable.schema.func), 2);
      assert.equal(thread.frameTable.data.getValue(3, thread.frameTable.schema.func), 3);
      assert.equal(thread.funcTable.data.getValue(0, thread.funcTable.schema.name), 0);
      assert.equal(thread.funcTable.data.getValue(1, thread.funcTable.schema.name), 1);
      assert.equal(thread.funcTable.data.getValue(2, thread.funcTable.schema.name), 2);
      assert.equal(thread.funcTable.data.getValue(3, thread.funcTable.schema.name), 3);
    });
    it('should create one funcStack per stack', function () {
      const thread = profile.threads[0];
      assert.equal(thread.stackTable.data.length, 4);
      assert.equal(thread.funcStackTable.data.length, 4);
      assert.property(thread.funcStackTable.schema, 'prefix');
      assert.property(thread.funcStackTable.schema, 'func');
      assert.equal(thread.funcStackTable.data.getValue(0, thread.funcStackTable.schema.func), 0);
      assert.equal(thread.funcStackTable.data.getValue(1, thread.funcStackTable.schema.func), 1);
      assert.equal(thread.funcStackTable.data.getValue(2, thread.funcStackTable.schema.func), 2);
      assert.equal(thread.funcStackTable.data.getValue(3, thread.funcStackTable.schema.func), 3);
    });
    it('should create one resource per used library', function () {
      const thread = profile.threads[0];
      assert.equal(thread.resourceTable.data.length, 1);
      assert.equal(thread.resourceTable.data.getValue(0, thread.resourceTable.schema.type), resourceTypes.library);
      const nameStringIndex = thread.resourceTable.data.getValue(0, thread.resourceTable.schema.name);
      assert.equal(thread.stringTable.getString(nameStringIndex), "firefox");
    });
    // TODO: add a JS frame to the example profile and check that we get a resource for the JS file
  });
});

describe('symbolication', function () {
  describe('getContainingLibrary', function () {
    let libs = [
      { start: 0, end: 20, name: 'first' },
      { start: 20, end: 40, name: 'second' },
      { start: 40, end: 50, name: 'third' },
      { start: 60, end: 80, name: 'fourth' },
      { start: 80, end: 100, name: 'fifth' },
    ];
    it('should return the first library for addresses inside the first library', function () {
      assert.equal(getContainingLibrary(libs, 0).name, 'first');
      assert.equal(getContainingLibrary(libs, 10).name, 'first');
      assert.equal(getContainingLibrary(libs, 19).name, 'first');
    });
    it('should return the second library for addresses inside the second library', function () {
      assert.equal(getContainingLibrary(libs, 20).name, 'second');
      assert.equal(getContainingLibrary(libs, 21).name, 'second');
      assert.equal(getContainingLibrary(libs, 27).name, 'second');
      assert.equal(getContainingLibrary(libs, 39).name, 'second');
    });
    it('should return the third library for addresses inside the third library', function () {
      assert.equal(getContainingLibrary(libs, 40).name, 'third');
      assert.equal(getContainingLibrary(libs, 41).name, 'third');
      assert.equal(getContainingLibrary(libs, 47).name, 'third');
      assert.equal(getContainingLibrary(libs, 49).name, 'third');
    });
    it('should return no library when outside or in holes', function () {
      assert.equal(getContainingLibrary(libs, -1), null);
      assert.equal(getContainingLibrary(libs, -10), null);
      assert.equal(getContainingLibrary(libs, 100), null);
      assert.equal(getContainingLibrary(libs, 256), null);
      assert.equal(getContainingLibrary(libs, 50), null);
      assert.equal(getContainingLibrary(libs, 55), null);
      assert.equal(getContainingLibrary(libs, 59), null);
    })
  });

  describe('symbolicateProfile', function (done) {
    let unsymbolicatedProfile = null;
    let symbolicatedProfile = null;

    before(function () {
      unsymbolicatedProfile = preprocessProfile(exampleProfile);
      const symbolTable = {
        0: 'first symbol',
        0xf00: 'second symbol',
        0x1a00: 'third symbol',
        0x2000: 'last symbol'
      };
      const symbolProvider = new FakeSymbolStore({ 'firefox': symbolTable, 'firefox-webcontent': symbolTable });
      const symbolicationPromise = symbolicateProfile(unsymbolicatedProfile, symbolProvider, {
        onUpdateProfile: function (updatedProfile) {
          symbolicatedProfile = updatedProfile;
        }
      });
      return symbolicationPromise;
    });

    it('should assign correct symbols to frames', function () {
      function functionNameForFrameInThread(thread, frameIndex) {
        const funcIndex = thread.frameTable.data.getValue(frameIndex, thread.frameTable.schema.func);
        const funcNameStringIndex = thread.funcTable.data.getValue(funcIndex, thread.funcTable.schema.name);
        return thread.stringTable.getString(funcNameStringIndex);
      }
      assert.equal(functionNameForFrameInThread(unsymbolicatedProfile.threads[0], 1), '0x100000f84');
      assert.equal(functionNameForFrameInThread(symbolicatedProfile.threads[0], 1), 'second symbol');
      assert.equal(functionNameForFrameInThread(unsymbolicatedProfile.threads[0], 2), '0x100001a45');
      assert.equal(functionNameForFrameInThread(symbolicatedProfile.threads[0], 2), 'third symbol');
    });
  });
  // TODO: check that functions are collapsed correctly
});
