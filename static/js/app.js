let editor;
let currentPath = '';
let selectedNode = null;
let editorInitialized = false;
let editingBlockId = null;

document.addEventListener('DOMContentLoaded', () => {
    initMonacoEditor();
    initTree();
    loadCodeBlocks();
    hljs.configure({ languages: ['1c'] });
    hljs.highlightAll();
    
    const checkEditor = setInterval(() => {
        if (editorInitialized) {
            console.log('Editor ready');
            clearInterval(checkEditor);
        }
    }, 500);
});

document.addEventListener('dragover', function(e) {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('drop', function(e) {
    e.preventDefault();
    e.stopPropagation();
});

function initMonacoEditor() {
    if (!editorInitialized) {
        require.config({
            paths: { 
                vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.36.1/min/vs' 
            },
            waitSeconds: 30
        });
        
        require(['vs/editor/editor.main'], function() {
            const container = document.getElementById('codeBlockContent');
            if (!container) {
                console.error('Editor container not found!');
                return;
            }

            container.style.height = '500px';
            editor = monaco.editor.create(container, {
                value: "",
                language: '1c',
                theme: 'vs-dark',
                minimap: { enabled: true },
                automaticLayout: true
            });

            editor.onDidChangeModelContent(() => {
                window.monacoContent = editor.getValue();
                console.log('Content changed:', window.monacoContent);
            });

            editorInitialized = true;
        });
    }
}

$(document).ready(function() {
    initTree();
    $('#fileTree').on('select_node.jstree', function(e, data) {
        if (data.node.type === 'file') {
            const pathParts = data.node.id.split('/');
            pathParts.pop();
            currentPath = pathParts.join('/') || '/';
        } else {
            currentPath = data.node.id || '/';
        }

        document.getElementById('currentPath').textContent = currentPath || '/';
    });
});

function initTree() {
    $('#fileTree').jstree({
        'core': {
            'data': loadTreeData,
            'check_callback': function(op, node, parent, position, more) {
                if (op === 'move_node') {
                    const parentNode = this.get_node(parent);
                    return parentNode && parentNode.type === 'folder';
                }
                return true;
            },
            'themes': {
                'icons': false,
                'dots': true,
                'stripes': false
            }
        },
        'plugins': ['dnd', 'contextmenu', 'wholerow'],
        'dnd': {
            'is_draggable': function(nodes) {
                return nodes.every(node => node.type !== 'root');
            },
            'inside_pos': 'last',
            'touch': true,
            'large_drop_target': true,
            'large_drag_target': false,
            'is_target': function(node) {
                return node.type === 'folder';
            },
            'copy': false
        },
        'contextmenu': {
            'items': generateContextMenu
        }
    });

    $('#fileTree')
    .on('move_node.jstree', handleMoveNode)
    .on('dnd_stop.vakata', function(e, data) {
        $('.jstree-dnd-helper').remove();
    });
}

async function loadTreeData(node, cb) {
    try {
        const path = node.id === '#' ? '' : node.id;
        const response = await fetch(`/get-content/${encodeURIComponent(path)}`);
        const data = await response.json();
        const items = data.content.map(item => ({
            id: item.path,
            text: `
                <div class="node-content">
                    <i class="${item.type === 'folder' ? 'fas fa-folder' : 'fas fa-file'}"></i>
                    <div class="flex-btn-namefile">
                        <span class="node-name">${item.name}</span>
                        ${item.type === 'file' ? 
                            `<button class="download-btn" 
                                    onclick="event.stopPropagation(); downloadFile('${encodeURIComponent(item.path)}')">
                                <i class="fas fa-download"></i>
                            </button>` : ''
                        }
                    </div>
                </div>
            `,
            type: item.type,
            children: item.type === 'folder',
            data: {
                name: item.name
            },
            li_attr: {
                class: "custom-node",
                style: "position: relative;"
            }
        }));
        
        cb(items);
    } catch (e) {
        showAlert(`Error loading content: ${e.message}`, 'danger');
        cb([]);
    }
}

function generateContextMenu(node) {
    const items = {
        create: {
            label: "New Folder",
            action: () => createFolderPrompt(node)
        },
        rename: {
            label: "Rename",
            action: () => renameItemPrompt(node)
        },
        remove: {
            label: "Delete",
            action: () => deleteItemPrompt(node)
        },
        move: {
            label: "Move",
            action: () => moveItemPrompt(node)
        }
    };

    if (node.type === 'file') {
        items.download = {
            label: "Download",
            action: () => downloadFile(node.id)
        };
    }

    return items;
}

async function createFolder() {
    const targetPath = selectedNode ? selectedNode.id : '';
    const name = prompt("Enter folder name");
    if (!name) return;

    if(!/^[a-zA-Z0-9_\- ]+$/.test(name)) {
        showAlert('Invalid folder name!', 'danger');
        return;
    }

    const newPath = targetPath ? `${targetPath}/${name}` : name;
    const response = await fetch('/create-folder/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `path=${encodeURIComponent(newPath)}`
    });

    if (!response.ok) {
        const error = await response.json();
        showAlert(`Error: ${error.message}`, 'danger');
        return;
    }
    $('#fileTree').jstree(true).refresh_node(selectedNode || '#');
    showAlert('Folder created successfully!', 'success');
}

async function renameItem() {
    if (!selectedNode) return alert('Please select an item first');
    await renameItemPrompt(selectedNode);
}

async function deleteItem() {
    if (!selectedNode) return alert('Please select an item first');
    await deleteItemPrompt(selectedNode);
}

async function moveItem() {
    if (!selectedNode) return alert('Please select an item first');
    await moveItemPrompt(selectedNode);
}

async function createFolderPrompt(node) {
    const name = prompt("Enter folder name");
    if (name) {
        if(!/^[a-zA-Z0-9_\- ]+$/.test(name)) {
            showAlert('Invalid folder name! Use only letters, numbers, spaces, hyphens and underscores.', 'danger');
            return;
        }
        
        try {
            const newPath = node.id ? `${node.id}/${name}` : name;
            const response = await fetch('/create-folder/', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: `path=${encodeURIComponent(newPath)}`
            });
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message);
            }
            
            $('#fileTree').jstree(true).refresh_node(node);
            showAlert('Folder created successfully!', 'success');
        } catch (e) {
            showAlert(`Error creating folder: ${e.message}`, 'danger');
        }
    }
}

async function renameItemPrompt(node) {
    const newName = prompt("Enter new name", node.text);
    if (newName) {
        await fetch('/rename-item/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `old_path=${encodeURIComponent(node.id)}&new_name=${encodeURIComponent(newName)}`
        });
        $('#fileTree').jstree(true).refresh_node(node.parent);
    }
}

async function deleteItemPrompt(node) {
    if (confirm(`Delete ${node.text}?`)) {
        await fetch('/delete-item/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `path=${encodeURIComponent(node.id)}`
        });
        $('#fileTree').jstree(true).delete_node(node);
    }
}

async function moveItemPrompt(node) {
    const folders = await fetchAllFolders();
    const select = $('#targetFolder');
    select.empty().append(folders.map(f => 
        `<option value="${f.id}">${f.text}</option>`
    ));
    
    new bootstrap.Modal('#moveModal').show();
    window.confirmMove = async () => {
        const newPath = select.val();
        await fetch('/move-item/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `old_path=${encodeURIComponent(node.id)}&new_path=${encodeURIComponent(newPath + '/' + node.text)}`
        });
        $('#fileTree').jstree(true).refresh(true);
        new bootstrap.Modal('#moveModal').hide();
    };
}

async function fetchAllFolders() {
    const response = await fetch('/get-content/');
    const data = await response.json();
    return extractFolders(data.content);
}

function extractFolders(items) {
    return items.reduce((acc, item) => {
        if (item.type === 'folder') {
            acc.push({
                id: item.path,
                text: item.name
            });
            acc.push(...extractFolders(item.children || []));
        }
        return acc;
    }, []);
}

function refreshTree() {
    $('#fileTree').jstree(true).refresh(true);
}

function handleMoveNode(e, data) {
    const oldPath = data.node.id;
    const newParent = data.parent === '#' ? '' : data.parent;
    const newParentNode = $('#fileTree').jstree(true).get_node(newParent);

    if (!newParentNode || newParentNode.type !== 'folder') {
        $('#fileTree').jstree(true).refresh();
        return false;
    }

    const originalName = data.node.original.data.name || data.node.text;
    const newPath = newParent ? `${newParent}/${originalName}` : originalName;

    const originalState = {
        parent: data.old_parent,
        position: data.old_position
    };

    fetch('/move-item/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `old_path=${encodeURIComponent(oldPath)}&new_path=${encodeURIComponent(newPath)}`
    }).then(response => {
        if (!response.ok) {
            $('#fileTree').jstree(true).move_node(
                data.node,
                originalState.parent,
                originalState.position
            );
            throw new Error('Move operation failed');
        }
        $('#fileTree').jstree(true).refresh_node(newParent);
    }).catch(error => {
        showAlert(`Error: ${error.message}`, 'danger', 3000);
    });
}

async function uploadFile() {
    const input = document.getElementById('fileInput');
    if (!input.files.length) return;

    let uploadPath = currentPath;
    
    if (selectedNode && selectedNode.type === 'file') {
        const pathParts = currentPath.split('/');
        pathParts.pop();
        uploadPath = pathParts.join('/');
    }

    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('path', uploadPath);

    try {
        const response = await fetch('/upload/', {
            method: 'POST',
            body: formData
        });
        if (response.ok) {
            $('#fileTree').jstree(true).refresh();
            showAlert('File uploaded successfully!', 'success');
        }
    } catch (e) {
        showAlert('Error uploading file: ' + e.message, 'danger');
    }
}

async function processFile() {
    const file = document.getElementById('fileSelect').value;
    const handler = document.getElementById('handlerSelect').value;
    const resultDiv = document.getElementById('processingResult');
    
    resultDiv.innerHTML = '<div class="text-center"><span class="loading-spinner"></span> Processing...</div>';
    
    try {
        const response = await fetch(`/process/${file}/${handler}`);
        const result = await response.json();
        resultDiv.innerHTML = `
            <pre>${JSON.stringify(result, null, 2)}</pre>
            <button onclick="this.parentElement.innerHTML=''" class="btn btn-sm btn-secondary">Clear</button>
        `;
    } catch (e) {
        resultDiv.innerHTML = `<div class="alert alert-danger">Error: ${e.message}</div>`;
    }
}

function getPreviewHTML(file) {
    if (file.type.startsWith('image')) {
        return `<img src="${file.preview}" class="file-preview">`;
    }
    if (file.type.startsWith('text')) {
        return `<pre class="code-preview">${file.preview_content || ''}</pre>`;
    }
    return `<div class="file-icon">${(file.type.split('/').pop() || 'FILE').toUpperCase()}</div>`;
}

function downloadFile(path) {
    const decodedPath = decodeURIComponent(path);
    const encodedPath = encodeURIComponent(decodedPath);

    window.open(`/download/${encodedPath}`, '_blank');
}

function showAlert(message, type = 'info', timeout = 3000) {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show fixed-top m-3`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.prepend(alert);
    setTimeout(() => alert.remove(), timeout);
}

async function loadCodeBlocks() {
    try {
        const response = await fetch('/code-blocks/');
        const blocks = await response.json();
        renderCodeBlocks(blocks);
    } catch (error) {
        console.error('Ошибка загрузки блоков:', error);
        showAlert('Не удалось загрузить блоки кода', 'danger');
    }
}

async function saveCodeBlock() {
    try {
        const title = document.getElementById('codeBlockTitle').value;
        const content = editor.getValue();
        
        const url = editingBlockId 
            ? `/update-code-block/${editingBlockId}/`
            : '/save-code-block/';

        const method = editingBlockId ? 'PUT' : 'POST';

        const response = await fetch(url, {
            method,
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
                title,
                content,
                id: editingBlockId || undefined
            })
        });

        if (!response.ok) throw new Error('Save failed');
        
        editingBlockId = null;
        showAlert('Block saved successfully!', 'success');
        const modal = bootstrap.Modal.getInstance(document.getElementById('codeBlockModal'));
        if (modal) {
            modal.hide();
        }
        clearEditor();
        loadCodeBlocks();
    } catch (e) {
        showAlert(`Error: ${e.message}`, 'danger');
    }
}

async function deleteCodeBlock(id) {
    if (confirm('Delete this code block?')) {
        await fetch(`/delete-code-block/${id}/`, { method: 'DELETE' });
        loadCodeBlocks();
    }
}

function showAddCodeBlockModal() {
    editingBlockId = null;
    document.getElementById('codeBlockTitle').value = '';

    if (editor && editorInitialized) {
        editor.setValue('');
        editor.layout();
        window.monacoContent = '';
    } else {
        console.error('Editor not initialized!');
        showAlert('Editor is not ready. Please wait...', 'warning');
        return;
    }
    
    const modal = new bootstrap.Modal(document.getElementById('codeBlockModal'));
    modal.show();
    
    setTimeout(() => {
        if (editor) {
            editor.focus();
            editor.layout();
        }
    }, 300);
}

function renderCodeBlocks(blocks) {
    const container = document.getElementById('codeBlocksContainer');
    if (!container) return;

    container.innerHTML = blocks.map(block => `
        <div class="card mb-3">
            <div class="card-header d-flex justify-content-between align-items-center">
                <div>
                    <button class="btn btn-sm btn-link" onclick="toggleCodeBlock('${block.id}')">
                        <i class="fas fa-chevron-${block.collapsed ? 'down' : 'up'}"></i>
                    </button>
                    ${block.title}
                </div>
                <div>
                    <button class="btn btn-sm btn-primary" onclick="editCodeBlock('${block.id}')">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn btn-sm btn-danger" onclick="deleteCodeBlock('${block.id}')">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </div>
            <div class="card-body" id="content-${block.id}" 
                 style="${block.collapsed ? 'display: none;' : ''}">
                <pre><code class="language-1c">${hljs.highlightAuto(block.content).value}</code></pre>
            </div>
        </div>
    `).join('');
}

function toggleCodeBlock(blockId) {
    const contentDiv = document.getElementById(`content-${blockId}`);
    const icon = contentDiv.previousElementSibling.querySelector('.fa-chevron-up, .fa-chevron-down');
    
    if (contentDiv.style.display === 'none') {
        contentDiv.style.display = 'block';
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
    } else {
        contentDiv.style.display = 'none';
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
    }
    
    updateBlockCollapsedState(blockId, contentDiv.style.display === 'none');
}

async function updateBlockCollapsedState(blockId, collapsed) {
    try {
        await fetch(`/update-block/${blockId}/`, {
            method: 'PATCH',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({collapsed})
        });
    } catch (e) {
        console.error('Error updating block state:', e);
    }
}

async function editCodeBlock(blockId) {
    try {
        const response = await fetch(`/get-code-block/${blockId}/`);
        const block = await response.json();
        
        editingBlockId = blockId;
        document.getElementById('codeBlockTitle').value = block.title;
        editor.setValue(block.content);
        
        new bootstrap.Modal(document.getElementById('codeBlockModal')).show();
    } catch (e) {
        showAlert('Error loading block for editing', 'danger');
    }
}

function clearEditor() {
    document.getElementById('codeBlockTitle').value = '';
    editor.setValue('');
    editingBlockId = null;
}

function refreshLists() {
    refreshTree();
    loadCodeBlocks();
}

document.addEventListener('DOMContentLoaded', refreshLists);