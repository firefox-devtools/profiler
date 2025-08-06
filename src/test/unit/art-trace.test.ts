/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  getSpecialCategory,
  CategoryInfo,
} from '../../profile-logic/import/art-trace';

describe('category-info', function () {
  const exampleMethodsForKnownCategories = [
    {
      methodId: 1,
      className: 'com.android.internal.policy.PhoneWindow',
      methodName: 'installDecor',
      signature: '<unused>',
    },
    {
      methodId: 1,
      className: 'java.lang.reflect.Proxy.getProxyClass0',
      methodName: 'getProxyClass0',
      signature: '<unused>',
    },
    {
      methodId: 1,
      className: 'sun.misc.Unsafe',
      methodName: 'compareAndSwapObject',
      signature: '<unused>',
    },
    {
      methodId: 1,
      className: 'kotlin.coroutines.jvm.internal.BaseContinuationImpl',
      methodName: 'resumeWith',
      signature: '<unused>',
    },
    {
      methodId: 1,
      className: 'kotlinx.coroutines.DispatchedTask',
      methodName: 'run',
      signature: '<unused>',
    },
    {
      methodId: 1,
      className: 'androidx.collection.SimpleArrayMap',
      methodName: 'put',
      signature: '<unused>',
    },
  ];

  it('should return no special category if there are no methods', function () {
    const specialCategoryInfo: any = getSpecialCategory([]);
    expect(specialCategoryInfo).toBe(undefined);
  });

  it('should ignore known categories', function () {
    const specialCategoryInfo: any = getSpecialCategory(
      exampleMethodsForKnownCategories
    );
    expect(specialCategoryInfo).toBe(undefined);
  });

  it('should return the right special category', function () {
    const specialCategoryInfo: any = getSpecialCategory([
      {
        methodId: 1,
        className: 'org.mozilla.Factory',
        methodName: 'createObject',
        signature: '<unused>',
      },
      ...exampleMethodsForKnownCategories,
    ]);
    expect(specialCategoryInfo).toBeTruthy();
    expect(specialCategoryInfo.name).toEqual('Mozilla');
    expect(specialCategoryInfo.prefixes).toEqual([
      'mozilla.',
      'com.mozilla.',
      'org.mozilla.',
    ]);
  });

  it('should return the majority category, 2 mozilla vs 1 arttracetest', function () {
    const specialCategoryInfo: any = getSpecialCategory([
      // Two "mozilla" methods, one "arttracetest" method
      {
        methodId: 1,
        className: 'org.mozilla.Factory',
        methodName: 'createObject',
        signature: '<unused>',
      },
      {
        methodId: 1,
        className: 'org.mozilla.FactoryCreator',
        methodName: 'createFactory',
        signature: '<unused>',
      },
      {
        methodId: 1,
        className: 'org.arttracetest.ArtTraceTester',
        methodName: 'inTheMinority',
        signature: '<unused>',
      },
      ...exampleMethodsForKnownCategories,
    ]);
    expect(specialCategoryInfo).toBeTruthy();
    expect(specialCategoryInfo.name).toEqual('Mozilla');
    expect(specialCategoryInfo.prefixes).toEqual([
      'mozilla.',
      'com.mozilla.',
      'org.mozilla.',
    ]);
  });

  it('should return the majority category, 1 mozilla vs 2 arttracetest', function () {
    const specialCategoryInfo: any = getSpecialCategory([
      // One "mozilla" method, two "arttracetest" methods.
      {
        methodId: 1,
        className: 'org.mozilla.Factory',
        methodName: 'createObject',
        signature: '<unused>',
      },
      {
        methodId: 1,
        className: 'com.arttracetest.ArtTraceTester',
        methodName: 'inTheMajorityCom',
        signature: '<unused>',
      },
      {
        methodId: 1,
        className: 'org.arttracetest.ArtTraceTester',
        methodName: 'inTheMajorityOrg',
        signature: '<unused>',
      },
      ...exampleMethodsForKnownCategories,
    ]);
    expect(specialCategoryInfo).toBeTruthy();
    expect(specialCategoryInfo.name).toEqual('Arttracetest');
    expect(specialCategoryInfo.prefixes).toEqual([
      'arttracetest.',
      'com.arttracetest.',
      'org.arttracetest.',
    ]);
  });

  it('should infer the right categories for these example methods', function () {
    const categoryInfo = new CategoryInfo([
      // One "mozilla" method, two "arttracetest" methods.
      {
        methodId: 1,
        className: 'org.mozilla.Factory',
        methodName: 'createObject',
        signature: '<unused>',
      },
      {
        methodId: 1,
        className: 'com.arttracetest.ArtTraceTester',
        methodName: 'inTheMajorityCom',
        signature: '<unused>',
      },
      {
        methodId: 1,
        className: 'org.arttracetest.ArtTraceTester',
        methodName: 'inTheMajorityOrg',
        signature: '<unused>',
      },
      ...exampleMethodsForKnownCategories,
    ]);

    expect(categoryInfo.categories[categoryInfo.specialCategory].name).toEqual(
      'Arttracetest'
    );

    expect(
      categoryInfo.inferJavaCategory(
        'com.android.internal.policy.PhoneWindow.installDecor'
      )
    ).toBe(categoryInfo.androidCategory);
    expect(
      categoryInfo.inferJavaCategory(
        'java.lang.reflect.Proxy.getProxyClass0.getProxyClass0'
      )
    ).toBe(categoryInfo.javaCategory);
    expect(
      categoryInfo.inferJavaCategory('sun.misc.Unsafe.compareAndSwapObject')
    ).toBe(categoryInfo.javaCategory);
    expect(
      categoryInfo.inferJavaCategory(
        'kotlin.coroutines.jvm.internal.BaseContinuationImpl.resumeWith'
      )
    ).toBe(categoryInfo.kotlinCategory);
    expect(
      categoryInfo.inferJavaCategory('kotlinx.coroutines.DispatchedTask.run')
    ).toBe(categoryInfo.kotlinCategory);
    expect(
      categoryInfo.inferJavaCategory('androidx.collection.SimpleArrayMap.put')
    ).toBe(categoryInfo.androidxCategory);
    expect(
      categoryInfo.inferJavaCategory(
        'androidx.constraintlayout.solver.widgets.ConstraintWidgetContainer.measure'
      )
    ).toBe(categoryInfo.androidxCategory);
    expect(
      categoryInfo.inferJavaCategory('org.arttracetest.ArtTraceVerifier.verify')
    ).toBe(categoryInfo.specialCategory);
    expect(
      categoryInfo.inferJavaCategory(
        'com.arttracetest.ArtTraceVerifier2.verify2'
      )
    ).toBe(categoryInfo.specialCategory);
    expect(
      categoryInfo.inferJavaCategory(
        'com.mozilla.NotSpecialEnough.noCategoryForYou'
      )
    ).toBe(categoryInfo.otherCategory);
  });
});
