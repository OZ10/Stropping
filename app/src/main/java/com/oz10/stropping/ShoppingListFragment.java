package com.oz10.stropping;

import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.view.LayoutInflater;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ListView;

import com.adapters.IngredientListAdapter;
import com.adapters.database.DatabaseHelper;
import com.adapters.database.StroppingDatabase;

import java.util.ArrayList;

/**
 * Created by Austen on 02/08/2016.
 */
public class ShoppingListFragment extends Fragment {

    private ArrayList<String> IngredientsList = new ArrayList<>();
        public IngredientListAdapter _shoppingListAdapter;

    @Override
    public void onResume() {
        super.onResume();
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        ViewGroup rootView = (ViewGroup) inflater.inflate(
                R.layout.fragment_shopping_list, container, false);

        //_shoppingListAdapter = new ShoppingListAdapter(getContext(), android.R.layout.simple_list_item_1, IngredientsList);
        _shoppingListAdapter = new IngredientListAdapter(getContext(), IngredientsList, R.layout.item_shoppinglist);
        _shoppingListAdapter.updateAdapterFromDatabase(getContext());
        ListView lv = (ListView) rootView.findViewById(R.id.shoppingListView);
        lv.setAdapter(_shoppingListAdapter);
        lv.setEmptyView(rootView.findViewById(android.R.id.empty));
        
        // This might need to be in the onCreate method
        setHasOptionsMenu(true);

        return rootView;
    }

    @Override
    public void onCreateOptionsMenu(Menu menu, MenuInflater inflater) {
        inflater.inflate(R.menu.menu_shoppinglist, menu);
    }

    public boolean onOptionsItemSelected(MenuItem item){
        if (item.getItemId() == R.id.action_menu_clear){
            StroppingDatabase db = new StroppingDatabase(getContext());
            db.open();
            db.DeleteAllRowsFromTable(DatabaseHelper.TABLE_SHOPPINGLIST);
            db.close();
            
            //TODO Maybe just clear the adapters list and notify at this point? Below method opens the database, queries etc
            _shoppingListAdapter.updateAdapterFromDatabase(getContext());
        }

        return true;
    }
}
