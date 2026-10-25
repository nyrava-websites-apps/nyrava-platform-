/**
 * Nyrava Team Meet External API
 * Drop-in embedding library (Drop-in replacement for JitsiMeetExternalAPI)
 * 
 * Usage:
 *   const meet = new NyravaTeamMeet({
 *     roomName: 'Austin-Territory',
 *     parentNode: document.getElementById('meet-container'),
 *     width: '100%',
 *     height: '600px',
 *     userInfo: { displayName: 'John Realtor' }
 *   });
 */

(function (global) {
  'use strict';

  class NyravaTeamMeet {
    constructor(options = {}) {
      this.roomName = options.roomName || 'team-' + Math.random().toString(36).substring(2, 8);
      this.parentNode = options.parentNode || document.body;
      this.width = options.width || '100%';
      this.height = options.height || '100%';
      this.userInfo = options.userInfo || {};
      
      // Derive baseUrl from the current script tag or location
      let scriptSrc = '';
      if (document.currentScript) {
        scriptSrc = document.currentScript.src;
      }
      this.baseUrl = options.domain 
        ? (options.domain.startsWith('http') ? options.domain : 'https://' + options.domain)
        : (scriptSrc ? new URL('.', scriptSrc).origin : window.location.origin);

      this.iframe = null;
      this.init();
    }

    init() {
      const q = new URLSearchParams();
      if (this.userInfo.displayName) {
        q.set('name', this.userInfo.displayName);
      }
      q.set('embed', '1');

      const roomUrl = `${this.baseUrl}/room/${encodeURIComponent(this.roomName)}?${q.toString()}`;

      const iframe = document.createElement('iframe');
      iframe.id = 'nyrava-team-meet-frame';
      iframe.title = 'Nyrava Team Meet Video Room';
      iframe.src = roomUrl;
      iframe.style.width = this.width;
      iframe.style.height = this.height;
      iframe.style.border = '0';
      iframe.style.borderRadius = '12px';
      iframe.style.background = '#081A3A';
      iframe.style.boxShadow = '0 8px 30px rgba(0, 0, 0, 0.4)';
      
      // Grant necessary permissions for WebRTC media devices
      iframe.setAttribute('allow', 'camera; microphone; display-capture; fullscreen; autoplay');
      iframe.setAttribute('allowfullscreen', 'true');

      if (this.parentNode) {
        this.parentNode.innerHTML = '';
        this.parentNode.appendChild(iframe);
      }
      this.iframe = iframe;
    }

    executeCommand(command, ...args) {
      if (this.iframe && this.iframe.contentWindow) {
        this.iframe.contentWindow.postMessage({
          source: 'nyrava-team-meet-api',
          command,
          args
        }, '*');
      }
    }

    dispose() {
      if (this.iframe && this.iframe.parentNode) {
        this.iframe.parentNode.removeChild(this.iframe);
        this.iframe = null;
      }
    }
  }

  // Alias as both NyravaTeamMeet and JitsiMeetExternalAPI for legacy compatibility
  global.NyravaTeamMeet = NyravaTeamMeet;
  if (!global.JitsiMeetExternalAPI) {
    global.JitsiMeetExternalAPI = NyravaTeamMeet;
  }

})(typeof window !== 'undefined' ? window : this);
