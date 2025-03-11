let currentPath = '';
let selectedNode = null;

// $(document).ready(function() {
//     $('#fileTree').jstree({
//         'core': {
//             'data': function(node, cb) {
//                 const path = node.id === '#' ? '' : node.id;
//                 fetch(`/get-content/${path}`)
//                     .then(response => response.json())
//                     .then(data => {
//                         const items = data.content.map(item => ({
//                             id: item.path,
//                             text: item.name,
//                             type: item.type,
//                             children: item.type === 'folder',
//                             icon: item.type === 'folder' ? 'jstree-folder' : 
//                                 (item.preview ? item.preview : 'jstree-file')
//                         }));
//                         cb(items);
//                     });
//             }
//         },
//         'plugins': ['contextmenu', 'types'],
//         'types': {
//             'folder': { 'icon': 'jstree-folder' },
//             'file': { 'icon': 'jstree-file' }
//         },
//         'contextmenu': {
//             'items': function(node) {
//                 return {
//                     createFolder: {
//                         label: "New Folder",
//                         action: function() {
//                             const name = prompt("Enter folder name");
//                             if (name) {
//                                 const newPath = node.id ? `${node.id}/${name}` : name;
//                                 fetch('/create-folder/', {
//                                     method: 'POST',
//                                     headers: {
//                                         'Content-Type': 'application/x-www-form-urlencoded',
//                                     },
//                                     body: `path=${encodeURIComponent(newPath)}`
//                                 }).then(() => {
//                                     $('#fileTree').jstree(true).refresh_node(node);
//                                 });
//                             }
//                         }
//                     },
//                     renameItem: {
//                         label: "Rename",
//                         action: function() {
//                             const newName = prompt("Enter new name", node.text);
//                             if (newName) {
//                                 fetch('/rename-item/', {
//                                     method: 'POST',
//                                     headers: {
//                                         'Content-Type': 'application/x-www-form-urlencoded',
//                                     },
//                                     body: `old_path=${encodeURIComponent(node.id)}&new_name=${encodeURIComponent(newName)}`
//                                 }).then(() => {
//                                     $('#fileTree').jstree(true).refresh_node(node.parent);
//                                 });
//                             }
//                         }
//                     },
//                     deleteItem: {
//                         label: "Delete",
//                         action: function() {
//                             if (confirm(`Delete ${node.text}?`)) {
//                                 fetch('/delete-item/', {
//                                     method: 'POST',
//                                     headers: {
//                                         'Content-Type': 'application/x-www-form-urlencoded',
//                                     },
//                                     body: `path=${encodeURIComponent(node.id)}`
//                                 }).then(() => {
//                                     $('#fileTree').jstree(true).delete_node(node);
//                                 });
//                             }
//                         }
//                     },
//                     moveItem: {
//                         label: "Move",
//                         action: function() {
//                             const newPath = prompt("Enter new path", Path.dirname(node.id));
//                             if (newPath !== null) {
//                                 const newFullPath = `${newPath}/${node.text}`;
//                                 fetch('/move-item/', {
//                                     method: 'POST',
//                                     headers: {
//                                         'Content-Type': 'application/x-www-form-urlencoded',
//                                     },
//                                     body: `old_path=${encodeURIComponent(node.id)}&new_path=${encodeURIComponent(newFullPath)}`
//                                 }).then(() => {
//                                     $('#fileTree').jstree(true).refresh();
//                                 });
//                             }
//                         }
//                     }
//                 };
//             }
//         }
//     });

//     $('#fileTree').on('select_node.jstree', function(e, data) {
//         currentPath = data.node.id;
//         document.getElementById('currentPath').textContent = currentPath || '/';
//     });
// });

// async function refreshLists() {
//     const files = await fetch('/files/').then(r => r.json());
//     const fileList = document.getElementById('fileList');
//     fileList.innerHTML = files.files.map(file => `
//         <div class="list-group-item file-item">
//             <div class="preview-container">
//                 ${getPreviewHTML(file)}
//             </div>
//             <div class="file-info">
//                 <div class="file-name">${file.filename}</div>
//                 <div class="file-actions">
//                     <button class="btn btn-sm btn-primary" 
//                             onclick="downloadFile('${file.filename}')">
//                         Download
//                     </button>
//                 </div>
//             </div>
//         </div>
//     `).join('');

//     const fileSelect = document.getElementById('fileSelect');

//     fileSelect.innerHTML = files.files.map(file => 
//         `<option value="${file}">${file}</option>`
//     ).join('');

//     const handlers = await fetch('/handlers/').then(r => r.json());
//     const handlerList = document.getElementById('handlerList');
//     const handlerSelect = document.getElementById('handlerSelect');
    
//     handlerList.innerHTML = handlers.handlers.map(handler => `
//         <div class="list-group-item">${handler}</div>
//     `).join('');

//     handlerSelect.innerHTML = handlers.handlers.map(handler => 
//         `<option value="${handler}">${handler}</option>`
//     ).join('');
// }

$(document).ready(function() {
    initTree();
    $('#fileTree').on('select_node.jstree', function(e, data) {
        selectedNode = data.node;
        currentPath = data.node.id;
        document.getElementById('currentPath').textContent = currentPath || '/';
    });
});

function initTree() {
    $('#fileTree').jstree({
        'core': {
            'data': loadTreeData,
            'check_callback': true
        },
        'plugins': ['dnd', 'contextmenu'],
        'contextmenu': {
            'items': generateContextMenu
        }
    }).on('ready.jstree', function() {
        const rootNode = $('#fileTree').jstree(true).get_node('#');
        $('#fileTree').jstree(true).select_node(rootNode.children[0]);
    });
}

async function loadTreeData(node, cb) {
    try {
        const path = node.id === '#' ? '' : node.id;
        const response = await fetch(`/get-content/${encodeURIComponent(path)}`);
        
        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message);
        }
        
        const data = await response.json();
        
        const items = data.content.map(item => ({
            id: item.path,
            text: item.name,
            type: item.type,
            children: item.type === 'folder',
            icon: item.preview ? item.preview : (item.type === 'folder' ? 'jstree-folder' : 'jstree-file')
        }));
        
        cb(items);
    } catch (e) {
        showAlert(`Error loading content: ${e.message}`, 'danger');
        cb([]);
    }
}

function generateContextMenu(node) {
    return {
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

async function uploadFile() {
    const input = document.getElementById('fileInput');
    if (!input.files.length) return;

    const formData = new FormData();
    formData.append('file', input.files[0]);
    formData.append('path', currentPath);

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

function downloadFile(filename) {
    window.open(`/download/${filename}`, '_blank');
}

function showAlert(message, type = 'info') {
    const alert = document.createElement('div');
    alert.className = `alert alert-${type} alert-dismissible fade show fixed-top m-3`;
    alert.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    document.body.prepend(alert);
    setTimeout(() => alert.remove(), 3000);
}

document.addEventListener('DOMContentLoaded', refreshLists);