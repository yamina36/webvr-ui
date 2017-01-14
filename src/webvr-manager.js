// Copyright 2016 Google Inc.
//
//     Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//     You may obtain a copy of the License at
//
// http://www.apache.org/licenses/LICENSE-2.0
//
//     Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
//     WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
//     See the License for the specific language governing permissions and
// limitations under the License.

import State from './states';
import EventEmitter from 'eventemitter3';
import screenfull from 'screenfull';

export default class WebVRManager extends EventEmitter {

  constructor() {
    super();
    this.state = State.PREPARING;

    this.checkDisplays();

    // Bind vr display present change event to __onVRDisplayPresentChange
    this.__onVRDisplayPresentChange = this.__onVRDisplayPresentChange.bind(this);
    window.addEventListener('vrdisplaypresentchange', this.__onVRDisplayPresentChange);

    this.__onChangeFullscreen = this.__onChangeFullscreen.bind(this);
    if (screenfull.enabled) {
      document.addEventListener(screenfull.raw.fullscreenchange, this.__onChangeFullscreen);
    }

  }

  /**
   * Check if the browser is compatible with WebVR and has headsets.
   * @returns {Promise<VRDisplay>}
   */
  checkDisplays() {
    return WebVRManager.getVRDisplay()
      .then((display) => {
        this.defaultDisplay = display;
        this.__setState(State.READY_TO_PRESENT);
        return display;
      })
      .catch((e) => {
        delete this.defaultDisplay;
        if (e.name == 'NO_DISPLAYS') {
          this.__setState(State.ERROR_NO_PRESENTABLE_DISPLAYS);
        } else if (e.name == 'WEBVR_UNSUPPORTED') {
          this.__setState(State.ERROR_BROWSER_NOT_SUPPORTED);
        } else {
          this.__setState(State.ERROR_UNKOWN);
        }
      });
  }

  /**
   * clean up object for garbage collection
   */
  remove() {
    window.removeEventListener('vrdisplaypresentchange', this.__onVRDisplayPresentChange);
    if (screenfull.enabled) {
      document.removeEventListener(screenfull.raw.fullscreenchanged, this.__onChangeFullscreen);
    }

    this.removeAllListeners();
  }

  /**
   * returns promise returning list of available VR displays.
   * @returns Promise<VRDisplay>
   */
  static getVRDisplay() {
    return new Promise((resolve, reject) => {
      if (!navigator || !navigator.getVRDisplays) {
        let e = new Error('Browser not supporting WebVR');
        e.name = 'WEBVR_UNSUPPORTED';
        reject(e);
        return;
      }

      const rejectNoDisplay = ()=> {
        // No displays are found.
        let e = new Error('No displays found');
        e.name = 'NO_DISPLAYS';
        reject(e);
      };

      navigator.getVRDisplays().then(
        function(displays) {
          // Promise succeeds, but check if there are any displays actually.
          for (var i = 0; i < displays.length; i++) {
            if (displays[i].capabilities.canPresent) {
              resolve(displays[i]);
              break;
            }
          }

          rejectNoDisplay();
        },
        rejectNoDisplay);
    });
  }

  /**
   * Enter presentation mode with your set VR display
   */
  enterVR(display, canvas) {
    return display.requestPresent([{
      source: canvas
    }])
      .then(
        ()=> {},
        //this could fail if:
        //1. Display `canPresent` is false
        //2. Canvas is invalid
        //3. not executed via user interaction
        ()=> this.__setState(State.ERROR_REQUEST_TO_PRESENT_REJECTED)
      );
  }

  exitVR(display) {
    return display.exitPresent()
      .then(
        ()=> {},
        //this could fail if:
        //1. exit requested while not currently presenting
        ()=> this.__setState(State.ERROR_EXIT_PRESENT_REJECTED)
      );
  }

  /**
   * Enter 360 mode
   */

  enter360(canvas) {
    if (screenfull.enabled) {
      screenfull.request(canvas);
    } else {
      // iOS
      this.__setState(State.PRESENTING_360);
    }
    return true;
  };

  exit360() {
    if (screenfull.enabled && screenfull.isFullscreen) {
      screenfull.exit();
    } else if (this.state == State.PRESENTING_360) {
      this.checkDisplays();
    }
    return true;
  };

  /**
   * @private
   */
  __setState(state) {
    if (state != this.state) {
      this.emit('change', state, this.state);
      this.state = state;
    }
  }

  __onChangeFullscreen(e) {
    if (screenfull.isFullscreen) {
      this.__setState(State.PRESENTING_360);
    } else {
      this.checkDisplays();
    }
  }

  /**
   * @private
   */
  __onVRDisplayPresentChange() {
    const isPresenting = this.defaultDisplay && this.defaultDisplay.isPresenting;
    this.__setState(isPresenting ? State.PRESENTING : State.READY_TO_PRESENT);
  }

}

