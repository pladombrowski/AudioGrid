import "https://unpkg.com/wired-card@2.1.0/lib/wired-card.js?module";
import {
    LitElement,
    html,
    css,
} from "https://unpkg.com/lit-element@2.4.0/lit-element.js?module";

class AudioGrid extends LitElement {
    static get properties() {
        return {
            hass: {type: Object},
            narrow: {type: Boolean},
            route: {type: Object},
            panel: {type: Object},
        };
    }

    render() {
        return html`
            <style include="ha-style">
                iframe {
                    border: 0;
                    width: 100%;
                    height: calc(100%);
                    background-color: var(--primary-background-color);
                }
            </style>
            <iframe src="http://192.168.41.38:3000/remote"
                    sandbox="allow-forms allow-popups allow-pointer-lock allow-same-origin allow-scripts"
                    allowfullscreen="true"
                    webkitallowfullscreen="true"
                    mozallowfullscreen="true"
            ></iframe>`;
    }

    static get styles() {
        return css`
            :host {
            }

            wired-card {
                padding: 10px;
                display: block;
                font-size: 18px;
                max-width: 100%;
                margin: 0 auto;
            }
        `;
    }
}

customElements.define("audio-grid", AudioGrid);