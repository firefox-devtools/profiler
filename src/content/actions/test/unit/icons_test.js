import { assert } from 'chai';
import sinon from 'sinon';
import * as icons from '../../icons';
import Image from './mocks/image';

describe('content/actions/icons', function () {
  beforeEach(() => {
    global.Image = Image;
  });

  afterEach(() => {
    delete global.Image;
    Image.cleanUp();
  });

  describe('iconStartLoading', function () {
    it('Successful icon', async function () {
      const dispatch = sinon.stub();
      let icon = 'http://some.icon.example.org/favicon.ico';
      let actionPromise = icons.iconStartLoading(icon)(dispatch);

      let imageInstance = Image._instances[0];
      assert.equal(imageInstance.src, icon);
      assert.equal(imageInstance.referrerPolicy, 'no-referrer');

      imageInstance.onload();
      await actionPromise;

      sinon.assert.calledWith(dispatch, { type: 'ICON_HAS_LOADED', icon });

      // Second request for the same icon shouldn't dspatch anything
      dispatch.reset();
      actionPromise = icons.iconStartLoading(icon)(dispatch);
      await actionPromise;

      assert.lengthOf(Image._instances, 1); // no new instance
      sinon.assert.notCalled(dispatch); // no dispatched action

      // 3rd request for another icon should dispatch the loaded action
      icon = 'http://another.icon.example.org/favicon.ico';
      dispatch.reset();
      actionPromise = icons.iconStartLoading(icon)(dispatch);

      imageInstance = Image._instances[1];
      assert.equal(imageInstance.src, icon);
      assert.equal(imageInstance.referrerPolicy, 'no-referrer');

      imageInstance.onload();
      await actionPromise;

      sinon.assert.calledWith(dispatch, { type: 'ICON_HAS_LOADED', icon });
    });

    it('Errored icon', async function () {
      const dispatch = sinon.stub();
      let icon = 'http://error.icon.example.org/favicon.ico';
      let actionPromise = icons.iconStartLoading(icon)(dispatch);

      let imageInstance = Image._instances[0];
      assert.equal(imageInstance.src, icon);
      assert.equal(imageInstance.referrerPolicy, 'no-referrer');

      imageInstance.onerror();
      await actionPromise;

      sinon.assert.calledWith(dispatch, { type: 'ICON_IN_ERROR', icon });

      // Second request for the same icon shouldn't dspatch anything
      dispatch.reset();
      actionPromise = icons.iconStartLoading(icon)(dispatch);
      await actionPromise;

      assert.lengthOf(Image._instances, 1); // no new instance
      sinon.assert.notCalled(dispatch); // no dispatched action

      // 3rd request for another icon should dispatch the loaded action
      icon = 'http://error2.icon.example.org/favicon.ico';
      dispatch.reset();
      actionPromise = icons.iconStartLoading(icon)(dispatch);

      imageInstance = Image._instances[1];
      assert.equal(imageInstance.src, icon);
      assert.equal(imageInstance.referrerPolicy, 'no-referrer');

      imageInstance.onerror();
      await actionPromise;

      sinon.assert.calledWith(dispatch, { type: 'ICON_IN_ERROR', icon });
    });
  });
});
