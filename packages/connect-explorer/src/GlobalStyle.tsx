import { createGlobalStyle } from 'styled-components';
import { variables } from '@trezor/components';

const GlobalStyle = createGlobalStyle`
    * , *:before , *:after {
        box-sizing: border-box;
    }

    * {
        margin: 0;
        padding: 0;
    }

    html, body {
        width: 100%;
        height: 100%;
    }

    html, body {
        position: relative;
        font-size: ${variables.FONT_SIZE.NORMAL};
        -webkit-font-smoothing: antialiased;
        -moz-osx-font-smoothing: grayscale;
        font-family: "TT Hoves", -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
        height: 100%;
        font-size: 14px;
        -webkit-font-smoothing: antialiased;
    }

    #root, .app-container {
        height: 100%;
    }

    a {
        text-decoration: none;
        cursor: pointer;
    }

    button:focus, input:focus, textarea:focus {
        outline: 0;
    }

    .docs-container {
        word-break: break-word;
        padding: 20px;
        font-size: 14px;
        line-height: 1.5;
        h1, h2, h3, h4 {
            margin: 0;
            font-weight: 600;
            line-height: 1.25;
            margin-bottom: 16px;
            margin-top: 24px;
            font-size: 1.75em;
        }
        h2 {
            font-size: 1.5em;
            border-bottom: 1px solid #eaecef;
            padding-bottom: .3em;
            margin-top: 12px;
        }
        h3 {
            font-size: 1.25em;
        }
        h4 {
            font-size: 1em;
        }
        p {
            margin: 16px 0px;
        }
    
        code {
            border-radius: 3px;
            font-size: 85%;
            background-color: rgba(27,31,35,.05);
            padding: .2em .4em;
            &.language-javascript {
                display: block;
                white-space: pre-wrap;
                background-color: #f6f8fa;
                line-height: 1.45;
                overflow: auto;
                padding: 16px;
            }
        }
    
        ul {
            padding-left: 2em;
            list-style: unset;
            li {
                em {
                    font-style: italic;
                }
            }
        }
    
        a {
            color: #0366d6;
            text-decoration: none;
        }

        img {
            width: 100%;
        }
    }

`;

export default GlobalStyle;