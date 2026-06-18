import fetch from 'node-fetch';

/**
 * Service to interact with Meta Graph API
 */

/**
 * Fetch lead details from Meta Graph API using leadgen_id
 * @param {string} leadgenId - The ID of the lead from Meta
 * @param {string} pageAccessToken - Access token for the Meta Page
 * @returns {Promise<Object>} - Lead details (name, phone, email, etc.)
 */
export async function getMetaLeadDetails(leadgenId, pageAccessToken) {
  const url = `https://graph.facebook.com/v19.0/${leadgenId}?access_token=${pageAccessToken}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      throw new Error(`Meta API Error: ${data.error.message}`);
    }

    // Meta returns lead data in a 'field_data' array
    const fieldData = data.field_data || [];
    const details = {
      meta_leadgen_id: leadgenId,
    };

    fieldData.forEach(field => {
      const name = field.name;
      const value = field.values[0];

      if (name === 'full_name' || name === 'name') details.name = value;
      if (name === 'phone_number') details.phone = value;
      if (name === 'email') details.email = value;
    });

    return details;
  } catch (error) {
    console.error('Error fetching Meta lead details:', error.message);
    throw error;
  }
}
