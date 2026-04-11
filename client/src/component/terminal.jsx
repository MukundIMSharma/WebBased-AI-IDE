import { Terminal as XTerminal } from '@xterm/xterm';
import { useRef, useEffect } from 'react';
import "@xterm/xterm/css/xterm.css"
import Socket from '../socket';


const Terminal = () => {
    const terminalRef = useRef();
    const isRendered = useRef(false)

    useEffect(() => {
        if (isRendered.current) return
        isRendered.current = true;
        const term = new XTerminal({
            rows: 12,
            cols: 120,
            // rows: 30,
        });
        term.open(terminalRef.current);

        term.onData(data => {
            console.log(data);
            Socket.emit("terminal:write", data);
        })

        Socket.on("terminal:data", (data) => {
            term.write(data);
        })
        return () => {
            Socket.off("terminal:data", (data) => {
                term.write(data);
            });
        }
    }, [])

    return (
        <div className="terminal-panel">
            <div className="terminal-header">
                <div className="terminal-tab active">Terminal</div>
            </div>
            <div className="terminal-body">
                {/* 
                    NOTE: Fit addon is intentionally skipped for now per user request.
                    The terminal is positioned within this body container.
                    Future refinement for auto-resize can be added here.
                */}
                <div ref={terminalRef} id="terminal" />
            </div>
        </div>
    )
}
export default Terminal;