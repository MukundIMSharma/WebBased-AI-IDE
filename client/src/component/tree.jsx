import { useState } from 'react';

const FileTreeNode = ({ fileName, nodes, onSelect, path = "" }) => {
    const isFolder = nodes && typeof nodes === 'object';
    const [isOpen, setIsOpen] = useState(false);

    const handleClick = (e) => {
        e.stopPropagation();
        if (isFolder) {
            setIsOpen(!isOpen);
        } else {
            onSelect(path);
        }
    };

    return (
        <div className="file-node">
            <div className="file-node-content" onClick={handleClick} style={{ cursor: 'pointer' }}>
                <span className="file-icon">
                    {isFolder ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ transform: isOpen ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="9 18 15 12 9 6"></polyline>
                        </svg>
                    ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
                            <polyline points="14 2 14 8 20 8"></polyline>
                        </svg>
                    )}
                </span>
                <span className="file-name">{fileName}</span>
            </div>
            {isFolder && isOpen && (
                <ul className="file-children">
                    {Object.keys(nodes).map(child => (
                        <li key={child}>
                            <FileTreeNode
                                fileName={child}
                                nodes={nodes[child]}
                                onSelect={onSelect}
                                path={path ? `${path}/${child}` : child}
                            />
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
};

const FileTree = ({ tree, onSelect }) => {
    return (
        <div className="file-tree-container">
            <FileTreeNode
                fileName="Projects"
                nodes={tree}
                onSelect={onSelect}
                path=""
            />
        </div>
    );
};

export default FileTree;