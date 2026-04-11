import { useState } from 'react'
import './App.css'
import Terminal from './component/terminal'
import { useEffect } from 'react';
import FileTree from './component/tree';
import ActivityBar from './component/ActivityBar';
import Editor from './component/Editor';
import Socket from './socket.js';
import AIChat from './component/AIChat';

function App() {

  const [fileTree, setfileTree] = useState({})
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFileContent, setSelectedFileContent] = useState("");


  const getFileTree = async () => {
    const response = await fetch('http://localhost:9000/files')
    const result = await response.json();
    setfileTree(result.tree);
  };

  const getFileContent = async (path) => {
    const response = await fetch(`http://localhost:9000/files/content?path=${encodeURIComponent(path)}`);
    const result = await response.json();
    setSelectedFileContent(result.content);
    setSelectedFile(path);
  };

  useEffect(() => {
    getFileTree();
  }, []);


  useEffect(() => {
    Socket.on('file:refresh', getFileTree);
    return () => {
      Socket.off('file:refresh', getFileTree);
    }
  }, [])

  const [terminalHeight, setTerminalHeight] = useState(300);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const [activeSidebar, setActiveSidebar] = useState('explorer');

  const startResizing = (mouseDownEvent) => {
    document.body.style.userSelect = 'none';
    const handleMouseMove = (mouseMoveEvent) => {
      const newHeight = window.innerHeight - mouseMoveEvent.clientY;
      // 35px ensures the "TERMINAL" tab header remains visible when collapsed
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
      // Activity bar is 48px wide
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

  return (
    <div className='playground-container' style={{ gridTemplateColumns: `48px ${sidebarWidth}px 1fr` }}>
      <ActivityBar activeSidebar={activeSidebar} setActiveSidebar={setActiveSidebar} />
      <div className='sidebar'>
        <div className='sidebar-header'>{activeSidebar === 'explorer' ? 'Explorer' : 'AI Chat'}</div>
        <div className="files" style={{ display: activeSidebar === 'explorer' ? 'block' : 'none', height: 'calc(100% - 30px)', overflowY: 'auto' }}>
          <FileTree tree={fileTree} onSelect={getFileContent} />
        </div>
        <div style={{ display: activeSidebar === 'ai-chat' ? 'block' : 'none', height: 'calc(100% - 30px)' }}>
          <AIChat selectedFile={selectedFile} selectedFileContent={selectedFileContent} />
        </div>
      </div>
      <div className='main-content' style={{ position: 'relative' }}>
        <div className="resizer-v" onMouseDown={startSidebarResizing} />
        <div className='editor-container'>
          <Editor
            selectedFile={selectedFile}
            content={selectedFileContent}
            onContentChange={setSelectedFileContent}
            onOpenAIChat={() => setActiveSidebar('ai-chat')}
          />
        </div>
        <div className="resizer-h" onMouseDown={startResizing} />
        <div className='terminal-container' style={{ height: `${terminalHeight}px` }}>
          <Terminal />
        </div>
      </div>
    </div>
  )
}

export default App;