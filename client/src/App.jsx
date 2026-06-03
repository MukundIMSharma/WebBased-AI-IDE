import { useState, useRef, useEffect } from 'react';
import './App.css';
import Terminal from './component/terminal';
import FileTree from './component/tree';
import ActivityBar from './component/ActivityBar';
import Editor from './component/Editor';
import Socket from './socket.js';
import AIChat from './component/AIChat';
import Login from './component/Login';

function App() {
  const [token, setToken] = useState(localStorage.getItem('token') || '');
  const [fileTree, setfileTree] = useState({});
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileContent, setSelectedFileContent] = useState("");
  const [hfTokenState, setHfTokenState] = useState({ hasToken: true, token: "" });

  const [editorContext, setEditorContext] = useState({ selectedText: "", cursorLine: 1, openTabs: [] });
  const [aiPrefill, setAiPrefill] = useState("");
  const editorAccessRef = useRef(null);

  const [terminalHeight, setTerminalHeight] = useState(300);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [activeSidebar, setActiveSidebar] = useState('explorer');

  // 1. Detect GitHub Callback Token on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    if (urlToken) {
      localStorage.setItem('token', urlToken);
      setToken(urlToken);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('token');
    setToken('');
    setfileTree({});
    setSelectedFile(null);
    setSelectedFileContent("");
  };

  const checkHfToken = async (authToken) => {
    if (!authToken) return;
    try {
      const response = await fetch('http://localhost:9000/api/user/hf-token', {
        headers: {
          'Authorization': `Bearer ${authToken}`
        }
      });
      if (response.status === 401 || response.status === 403) {
        handleLogout();
        return;
      }
      const result = await response.json();
      setHfTokenState({ hasToken: result.hasToken, token: result.hfToken || "" });
      if (!result.hasToken) {
        setSelectedFile('settings');
      }
    } catch (err) {
      console.error("Failed to check HuggingFace token:", err);
    }
  };

  const getFileTree = async () => {
    if (!token) return;
    try {
      const response = await fetch('http://localhost:9000/files', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401 || response.status === 403) {
        handleLogout();
        return;
      }
      const result = await response.json();
      setfileTree(result.tree);
    } catch (err) {
      console.error("Failed to load file tree:", err);
    }
  };

  const getFileContent = async (path) => {
    if (!token) return;
    try {
      const response = await fetch(`http://localhost:9000/files/content?path=${encodeURIComponent(path)}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (response.status === 401 || response.status === 403) {
        handleLogout();
        return;
      }
      const result = await response.json();
      setSelectedFileContent(result.content);
      setSelectedFile(path);
    } catch (err) {
      console.error("Failed to load file content:", err);
    }
  };

  // 2. Manage Socket.IO lifecycle and data polling
  useEffect(() => {
    if (token) {
      Socket.auth = { token };
      Socket.connect();

      getFileTree();
      checkHfToken(token);

      const refreshHandler = () => getFileTree();
      Socket.on('file:refresh', refreshHandler);

      return () => {
        Socket.off('file:refresh', refreshHandler);
        Socket.disconnect();
      };
    }
  }, [token]);

  const startResizing = (mouseDownEvent) => {
    document.body.style.userSelect = 'none';
    const handleMouseMove = (mouseMoveEvent) => {
      const newHeight = window.innerHeight - mouseMoveEvent.clientY;
      if (newHeight >= 35 && newHeight <= 300) {
        setTerminalHeight(newHeight);
      }
    };

    const handleMouseUp = () => {
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const startSidebarResizing = (mouseDownEvent) => {
    document.body.style.userSelect = 'none';
    const handleMouseMove = (mouseMoveEvent) => {
      const newWidth = mouseMoveEvent.clientX - 48;
      if (newWidth > 120 && newWidth < Math.min(600, window.innerWidth - 200)) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      document.body.style.userSelect = 'auto';
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Render Login Gate if unauthenticated
  if (!token) {
    return <Login />;
  }

  return (
    <div className='playground-container' style={{ gridTemplateColumns: `48px ${sidebarWidth}px 1fr` }}>
      <ActivityBar activeSidebar={activeSidebar} setActiveSidebar={setActiveSidebar} onConfigureToken={() => setSelectedFile('settings')} />
      <div className='sidebar'>
        <div className='sidebar-header' style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{activeSidebar === 'explorer' ? 'Explorer' : 'AI Chat'}</span>
          <button 
            onClick={handleLogout} 
            style={{ 
              background: 'transparent', 
              border: 'none', 
              color: '#ef4444', 
              fontSize: '11px', 
              cursor: 'pointer',
              padding: '2px 6px',
              borderRadius: '4px'
            }}
          >
            Logout
          </button>
        </div>
        <div className="files" style={{ display: activeSidebar === 'explorer' ? 'block' : 'none', height: 'calc(100% - 30px)', overflowY: 'auto' }}>
          <FileTree tree={fileTree} onSelect={getFileContent} />
        </div>
        <div style={{ display: activeSidebar === 'ai-chat' ? 'block' : 'none', height: 'calc(100% - 30px)' }}>
          <AIChat 
            selectedFile={selectedFile} 
            selectedFileContent={selectedFileContent} 
            editorContext={editorContext}
            aiPrefill={aiPrefill}
            setAiPrefill={setAiPrefill}
            hfTokenState={hfTokenState}
            onOpenTokenModal={() => setSelectedFile('settings')}
            onApplyToEditor={(startLine, endLine, blockContent) => {
              if (editorAccessRef.current) {
                editorAccessRef.current.applyReplaceBlock(startLine, endLine, blockContent);
              }
            }}
          />
        </div>
      </div>
      <div className='main-content' style={{ position: 'relative' }}>
        <div className="resizer-v" onMouseDown={startSidebarResizing} />
        <div className='editor-container'>
          <Editor
            ref={editorAccessRef}
            selectedFile={selectedFile}
            content={selectedFileContent}
            onContentChange={setSelectedFileContent}
            onContextChange={setEditorContext}
            hfTokenState={hfTokenState}
            onSaveSuccess={(newToken) => {
              setHfTokenState({ hasToken: true, token: newToken });
            }}
            onCloseSettings={() => {
              setSelectedFile(null);
            }}
            onOpenAIChat={(prompt) => {
              setActiveSidebar('ai-chat');
              if (prompt) setAiPrefill(prompt);
            }}
          />
        </div>
        <div className="resizer-h" onMouseDown={startResizing} />
        <div className='terminal-container' style={{ height: `${terminalHeight}px` }}>
          <Terminal />
        </div>
      </div>
    </div>
  );
}

export default App;