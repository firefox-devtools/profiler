/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// @flow

/*
 * A not-void type
 * https://flow.org/try/#0C4TwDgpgBAcg9sAanAlgEygXigKClAHygDsBXAWwCMIAnPQqAZ2BpWIHN6jK44AbCAENiXEqT59RAQRo1BIADzCQAPlEB5SgCsIAY2ABuHDgBmpYvpRxiUMxYUAVAFywEydCoAUAN0F9SEC4OAJRBUADe9DQQwKQ0Nr7+EEYAvsZ2up4AjMFGGZ4ARMysHAW5puaZ4ba8LgDklII0dVAp5flkEu2VngDaWQA0UABMALrdFp7maBAmbBBoE5nlQA
 */
export type NotVoidOrNull = number | string | boolean | Array<any> | Object;
