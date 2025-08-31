// Modular API calls

// Create a new modular
export async function createModular(modularData) {
  try {
    const res = await fetch('/modular', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(modularData),
    });
    if (!res.ok) throw new Error('Network response was not ok');
    return res.json();
  } catch (error) {
    console.error('Error creating modular:', error);
    throw error;
  }
}

// Get a modular by ID
export async function getModular(modularId) {
    try {
        const res = await fetch(`/modular/${modularId}`);
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
    } catch (error) {
        console.error('Error fetching modular:', error);
        throw error;
    }

}

// Update a modular by ID
export async function updateModular(modularId, modularData) {
    try {
        const res = await fetch(`/modular/${modularId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(modularData),
        });
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
    } catch (error) {
        console.error('Error updating modular:', error);
        throw error;
    }
}

// Delete a modular by ID
export async function deleteModular(modularId) {
    try {
        const res = await fetch(`/modular/${modularId}`, {
            method: 'DELETE',
        });
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
    } catch (error) {
        console.error('Error deleting modular:', error);
        throw error;
    }
}
