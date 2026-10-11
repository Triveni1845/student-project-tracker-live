const form = document.querySelector('#project-form');
const nameInput = document.querySelector('#name');
const statusInput = document.querySelector('#status');
const projectList = document.querySelector('#project-list');
const emptyState = document.querySelector('#empty-state');
const saveButton = document.querySelector('#save-button');
const cancelButton = document.querySelector('#cancel-button');
const message = document.querySelector('#message');

// The API is the source of truth for project records.
// This array only holds the currently loaded API response.
let projects = [];
let editingProjectId = null;
let loadingProjects = false;
let mutationInProgress = false;
let initialLoadSucceeded = false;

// Display a message to the user.
function showMessage(text, isError = false) {
message.textContent = text;
message.style.color = isError ? '#b91c1c' : '#176b4d';
}

// Read an API response and extract a useful error message.
async function getResponseError(response) {
try {
const data = await response.json();


    if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
    }
} catch (error) {
    // The server may return a non-JSON error response.
}

return `Request failed with HTTP ${response.status}.`;


}

// Make a request and handle HTTP errors.
async function apiRequest(url, options = {}) {
let response;


try {
    response = await fetch(url, options);
} catch (error) {
    throw new Error(
        'Unable to connect to the server. Check that the server is running and try again.'
    );
}

if (!response.ok) {
    throw new Error(await getResponseError(response));
}

return response;


}

// Return true when a project has a valid server-generated ID.
function hasValidId(project) {
return (
project &&
typeof project === 'object' &&
!Array.isArray(project) &&
(
(typeof project.id === 'number' &&
Number.isSafeInteger(project.id) &&
project.id > 0) ||
(typeof project.id === 'string' &&
project.id.trim() !== '')
)
);
}

// Validate the collection returned by the API.
function isValidProjects(data) {
if (!Array.isArray(data)) {
return false;
}


const ids = new Set();

for (const project of data) {
    if (
        !hasValidId(project) ||
        typeof project.name !== 'string' ||
        project.name.trim() === '' ||
        typeof project.status !== 'string' ||
        !['Planned', 'In Progress', 'Completed'].includes(
            project.status
        )
    ) {
        return false;
    }

    const idKey = String(project.id);

    if (ids.has(idKey)) {
        return false;
    }

    ids.add(idKey);
}

return true;


}

// Compare IDs without changing the ID returned by the server.
function sameId(firstId, secondId) {
return String(firstId) === String(secondId);
}

// Load the current collection from the API.
async function loadProjects({ showLoading = true } = {}) {
if (loadingProjects) {
return false;
}


loadingProjects = true;

if (showLoading) {
    showMessage('Loading projects...');
}

emptyState.hidden = true;

try {
    const response = await apiRequest('/api/projects');
    const data = await response.json();

    if (!isValidProjects(data)) {
        throw new Error(
            'The server returned invalid project data. Existing displayed data has been preserved.'
        );
    }

    projects = data;
    initialLoadSucceeded = true;

    // If the project being edited no longer exists, exit edit mode.
    if (
        editingProjectId !== null &&
        !projects.some(project =>
            sameId(project.id, editingProjectId)
        )
    ) {
        resetEditing({ focusInput: false });
    }

    renderProjects();

    if (projects.length === 0) {
        showMessage('No projects have been added yet.');
    } else {
        showMessage(`${projects.length} project(s) loaded successfully.`);
    }

    return true;
} catch (error) {
    showMessage(error.message, true);

    // A failed load is not the same as an empty collection.
    if (!initialLoadSucceeded) {
        emptyState.hidden = true;
        projectList.replaceChildren();
    }

    return false;
} finally {
    loadingProjects = false;
    updateControls();
}


}

// Reset the form and exit editing mode.
function resetEditing({ focusInput = true } = {}) {
editingProjectId = null;


form.reset();

saveButton.textContent = 'Save Project';
cancelButton.hidden = true;

if (focusInput) {
    nameInput.focus();
}

updateControls();


}

// Enable or disable controls according to the current operation.
function updateControls() {
const busy = loadingProjects || mutationInProgress;


saveButton.disabled = busy;
cancelButton.disabled = busy;

form.querySelectorAll('input, select').forEach(input => {
    input.disabled = busy;
});

projectList.querySelectorAll('button').forEach(button => {
    button.disabled = busy;
});


}

// Display projects returned by the API.
function renderProjects() {
projectList.replaceChildren();

for (const project of projects) {
    const listItem = document.createElement('li');

    const projectName = document.createElement('span');
    projectName.textContent = project.name;

    const projectStatus = document.createElement('span');
    projectStatus.textContent = ` — ${project.status}`;

    // Edit button.
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';

    editButton.addEventListener('click', () => {
        if (loadingProjects || mutationInProgress) {
            return;
        }

        // Look up the latest copy from the current API collection.
        const currentProject = projects.find(item =>
            sameId(item.id, project.id)
        );

        if (!currentProject) {
            showMessage('This project could not be found.', true);
            return;
        }

        editingProjectId = currentProject.id;

        nameInput.value = currentProject.name;
        statusInput.value = currentProject.status;

        saveButton.textContent = 'Update Project';
        cancelButton.hidden = false;

        showMessage(`Editing "${currentProject.name}".`);
        nameInput.focus();

        updateControls();
    });

    // Delete button.
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.textContent = 'Delete';

    deleteButton.addEventListener('click', async () => {
        if (loadingProjects || mutationInProgress) {
            return;
        }

        const currentProject = projects.find(item =>
            sameId(item.id, project.id)
        );

        if (!currentProject) {
            showMessage('This project could not be found.', true);
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete "${currentProject.name}"?`
        );

        // Cancellation must not send a DELETE request.
        if (!confirmed) {
            showMessage('Deletion cancelled.');
            return;
        }

        await deleteProject(currentProject);
    });

    listItem.append(
        projectName,
        projectStatus,
        editButton,
        deleteButton
    );

    projectList.appendChild(listItem);
}

emptyState.hidden = projects.length > 0;

updateControls();


}

// Send a mutation request and refresh from the API after success.
async function performMutation(url, options, successMessage) {
if (mutationInProgress || loadingProjects) {
return false;
}


mutationInProgress = true;
updateControls();
showMessage('Saving changes...');

try {
    await apiRequest(url, options);

    // Refresh the collection from the server after a successful mutation.
    const loaded = await loadProjects({ showLoading: false });

    if (!loaded) {
        showMessage(
            `${successMessage} However, the project list could not be refreshed. Reload the list to verify the current data.`,
            true
        );

        return true;
    }

    showMessage(successMessage);
    return true;
} catch (error) {
    showMessage(error.message, true);
    return false;
} finally {
    mutationInProgress = false;
    updateControls();
}


}

// Delete a project through the API.
async function deleteProject(project) {
const wasBeingEdited = (
editingProjectId !== null &&
sameId(editingProjectId, project.id)
);


const success = await performMutation(
    `/api/projects/${encodeURIComponent(project.id)}`,
    {
        method: 'DELETE'
    },
    'Project deleted successfully.'
);

if (!success) {
    return;
}

// Exit edit mode if the deleted project was being edited.
if (wasBeingEdited) {
    resetEditing({ focusInput: false });
}


}

// Keep one intended form submit listener for both creation and editing.
form.addEventListener('submit', async event => {
event.preventDefault();


if (mutationInProgress || loadingProjects) {
    return;
}

const name = nameInput.value.trim();
const status = statusInput.value;

if (name.length < 1 || name.length > 80) {
    showMessage(
        'Enter a project name between 1 and 80 characters.',
        true
    );
    nameInput.focus();
    return;
}

if (!['Planned', 'In Progress', 'Completed'].includes(status)) {
    showMessage('Select a valid project status.', true);
    statusInput.focus();
    return;
}

const isEditing = editingProjectId !== null;

let url = '/api/projects';
let method = 'POST';

if (isEditing) {
    const projectExists = projects.some(project =>
        sameId(project.id, editingProjectId)
    );

    if (!projectExists) {
        resetEditing();
        showMessage(
            'The project being edited could not be found. Reload the project list.',
            true
        );
        return;
    }

    url = `/api/projects/${encodeURIComponent(editingProjectId)}`;
    method = 'PUT';
}

const success = await performMutation(
    url,
    {
        method,
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name, status })
    },
    isEditing
        ? 'Project updated successfully.'
        : 'Project added successfully.'
);

// Do not reset the form or lose edit mode if the mutation fails.
if (!success) {
    return;
}

resetEditing();


});

// Cancel editing without sending a mutation request.
cancelButton.addEventListener('click', () => {
if (mutationInProgress || loadingProjects) {
return;
}


resetEditing();
showMessage('Edit cancelled. No changes were saved.');

});

// Load the API collection when the page starts.
loadProjects();
