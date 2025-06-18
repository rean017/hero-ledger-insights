
import { supabase } from "@/integrations/supabase/client";

export const ensureMerchantHeroSetup = async () => {
  try {
    // Ensure Merchant Hero exists
    const { data: existingMerchantHero, error: checkError } = await supabase
      .from('agents')
      .select('id')
      .eq('name', 'Merchant Hero')
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking for Merchant Hero:', checkError);
      return;
    }

    if (!existingMerchantHero) {
      console.log('Creating Merchant Hero agent...');
      const { error: insertError } = await supabase
        .from('agents')
        .insert([{ name: 'Merchant Hero', is_active: true }]);
      
      if (insertError) {
        console.error('Error creating Merchant Hero:', insertError);
        return;
      }
    }

    // Get all locations that don't have Merchant Hero assigned
    const { data: locationsWithoutMerchantHero, error: queryError } = await supabase
      .from('locations')
      .select(`
        id, 
        name,
        location_agent_assignments!inner(location_id)
      `)
      .not('location_agent_assignments.agent_name', 'eq', 'Merchant Hero')
      .eq('location_agent_assignments.is_active', true);

    if (queryError) {
      console.error('Error querying locations:', queryError);
      return;
    }

    // Also get locations with no assignments at all
    const { data: locationsWithNoAssignments, error: noAssignError } = await supabase
      .from('locations')
      .select('id, name')
      .not('id', 'in', 
        supabase
          .from('location_agent_assignments')
          .select('location_id')
          .eq('is_active', true)
      );

    if (noAssignError) {
      console.error('Error querying locations with no assignments:', noAssignError);
      return;
    }

    // Combine both sets of locations that need Merchant Hero
    const allLocationsNeedingMerchantHero = [
      ...(locationsWithoutMerchantHero || []),
      ...(locationsWithNoAssignments || [])
    ];

    // Remove duplicates based on id
    const uniqueLocations = allLocationsNeedingMerchantHero.filter(
      (location, index, self) => self.findIndex(l => l.id === location.id) === index
    );

    if (uniqueLocations.length > 0) {
      console.log(`Assigning Merchant Hero to ${uniqueLocations.length} locations...`);
      
      // Create assignments in batch
      const assignments = uniqueLocations.map(location => ({
        location_id: location.id,
        agent_name: 'Merchant Hero',
        commission_rate: 0, // 0 BPS since they get the remainder
        is_active: true
      }));

      const { error: batchInsertError } = await supabase
        .from('location_agent_assignments')
        .insert(assignments);

      if (batchInsertError) {
        console.error('Error batch inserting Merchant Hero assignments:', batchInsertError);
      } else {
        console.log('Successfully assigned Merchant Hero to all locations');
      }
    }
  } catch (error) {
    console.error('Error in ensureMerchantHeroSetup:', error);
  }
};
