import React, { useEffect, useState } from 'react';
import styled, { ThemeProvider } from 'styled-components';
import { createRoot } from 'react-dom/client';

import { LogMessage } from '@trezor/connect/src/utils/debug';
import { Button, P, THEME, variables } from '@trezor/components';
import { ErrorBoundary } from '@trezor/connect-ui/src/support/ErrorBoundary';
import { GlobalStyle } from '@trezor/connect-ui/src/support/GlobalStyle';
import { InfoPanel } from '@trezor/connect-ui/src/components/InfoPanel';
import { View } from '@trezor/connect-ui/src/components/View';

interface ReactWrapperProps {
    children: React.ReactNode;
}

const MAX_ENTRIES = 1000;

const ThemeWrapper = ({ children }: ReactWrapperProps) => (
    <ThemeProvider theme={THEME.light}>{children}</ThemeProvider>
);

const Layout = styled.div`
    display: flex;
    flex: 1;
    height: 100%;

    @media (max-width: 639px) {
        flex-direction: column;
    }
`;

const StyledP = styled(P)`
    margin: 0 20%;
    font-size: 15px;
    font-weight: ${variables.FONT_WEIGHT.LIGHT}
    color: #757575
`;

const Wrapper = styled.div`
    display: flex;
    flex-direction: column;
    justify-content: space-evenly;
    align-items: center;
    text-align: center;
    min-height: 70vh;
    margin-top: 10vh;
    width: 100%;
`;

const orderByTimestamp = <T extends LogMessage>(logs: T[]): T[] =>
    [...logs].sort((a, b) => a.timestamp - b.timestamp);

const DownloadButton = ({ array, filename }: { array: any[]; filename: string }) => {
    const downloadArrayAsFile = () => {
        const data = JSON.stringify(array, null, 2);
        const blob = new Blob([data], { type: 'application/json' });

        // Temporary anchor element.
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = filename;
        document.body.appendChild(a);

        // Programmatically trigger a click event on the anchor element.
        a.click();

        // Remove the anchor element from the document body.
        document.body.removeChild(a);

        URL.revokeObjectURL(a.href);
    };

    return (
        <Button data-test="@log-container/download-button" onClick={downloadArrayAsFile}>
            Download Logs
        </Button>
    );
};

const logInConsole = (logs: any[]) => {
    logs.forEach(log => {
        const { prefix, css, message } = log;
        console.log(`%c${prefix}`, css, ...message);
    });
};

const useLogWorker = (setLogs: React.Dispatch<React.SetStateAction<any[]>>) => {
    const logWorker = new SharedWorker('./workers/shared-logger-worker.js');
    useEffect(() => {
        logWorker.port.onmessage = function (event) {
            const { data } = event;
            switch (data.type) {
                case 'get-logs':
                    logInConsole(data.payload);
                    setLogs(data.payload);
                    break;
                case 'log-entry':
                    logInConsole([data.payload]);
                    setLogs(prevLogs => {
                        if (prevLogs.length > MAX_ENTRIES) {
                            prevLogs.shift();
                        }
                        return [...prevLogs, data.payload];
                    });
                    break;
                default:
            }
        };

        logWorker.port.postMessage({ type: 'get-logs' });
        logWorker.port.postMessage({ type: 'subscribe' });

        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return logWorker;
};

const DebugCenter = () => {
    const [logs, setLogs] = useState<any[]>([]);
    useLogWorker(setLogs);

    return (
        <>
            {logs.length > 0 ? (
                <View
                    title="Logs"
                    buttons={
                        <DownloadButton
                            array={orderByTimestamp(logs)}
                            filename="trezor-connect-logs.json"
                        />
                    }
                >
                    <StyledP>
                        You can download the logs clicking the button below. The logs contain
                        information about the communication between your Trezor device and your
                        internet browser.
                    </StyledP>
                </View>
            ) : (
                <Wrapper>
                    <StyledP>Waiting for an app to connect</StyledP>
                </Wrapper>
            )}
        </>
    );
};

const App = () => (
    <ErrorBoundary>
        <GlobalStyle />
        <ThemeWrapper>
            <Layout>
                <InfoPanel method="Trezor Debug Center" origin={window.origin} />
                <DebugCenter />
            </Layout>
        </ThemeWrapper>
    </ErrorBoundary>
);

const renderUI = () => {
    const debugReact = document.getElementById('debug-react');
    debugReact!.style.height = '100%';
    const root = createRoot(debugReact!);
    const Component = <App />;

    root.render(Component);
};

renderUI();