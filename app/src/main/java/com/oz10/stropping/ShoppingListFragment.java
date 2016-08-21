package com.oz10.stropping;

import android.os.Bundle;
import android.support.v4.app.Fragment;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ArrayAdapter;
import android.widget.ListView;

import com.adapters.ShoppingListAdapter;

import java.util.ArrayList;

/**
 * Created by Austen on 02/08/2016.
 */
public class ShoppingListFragment extends Fragment {

    private ArrayList<String> IngredientsList = new ArrayList<>();
    //public ArrayAdapter _shoppingListAdapter;
    public ShoppingListAdapter _shoppingListAdapter;

    @Override
    public void onResume() {
        super.onResume();
    }

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        ViewGroup rootView = (ViewGroup) inflater.inflate(
                R.layout.fragment_shopping_list, container, false);

        //_shoppingListAdapter = new ArrayAdapter(getContext(), android.R.layout.simple_list_item_1, IngredientsList);
        _shoppingListAdapter = new ShoppingListAdapter(getContext(), android.R.layout.simple_list_item_1, IngredientsList);
        ListView lv = (ListView) rootView.findViewById(R.id.shoppingListView);
        lv.setAdapter(_shoppingListAdapter);

        return rootView;
    }
}
