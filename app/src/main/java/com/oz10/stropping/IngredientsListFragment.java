package com.oz10.stropping;

import android.content.Intent;
import android.os.Bundle;
import android.support.design.widget.FloatingActionButton;
import android.support.v4.app.Fragment;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.CheckBox;
import android.widget.ListView;

import com.adapters.IngredientListAdapter;
import com.adapters.database.StroppingDatabase;
import com.classes.Ingredient;

import java.util.ArrayList;

/**
 * Created by Austen on 02/08/2016.
 */
public class IngredientsListFragment extends Fragment {

    ArrayList<Ingredient> _ingredientsList = new ArrayList<>();
    //ArrayList<Ingredient> _selectedIngredientsList = new ArrayList<>();
    ListView _ingredientsListView;
    IngredientListAdapter _ingredientsAdatper;
    //Boolean _hasSelectedItems = false;
    
    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        ViewGroup rootView = (ViewGroup) inflater.inflate(
                R.layout.fragment_ingredients, container, false);

        StroppingDatabase db = new StroppingDatabase(getContext());
        db.open();
        _ingredientsList = db.getAllIngredients();
        db.close();

        _ingredientsAdatper = new IngredientListAdapter(getContext(), R.layout.item_ingredient, _ingredientsList);

        _ingredientsListView = (ListView) rootView.findViewById(R.id.ingredientslistView);
        _ingredientsListView.setAdapter(_ingredientsAdatper);

//        _ingredientsListView.setOnItemClickListener(new AdapterView.OnItemClickListener()
//        {
//            @Override
//            public void onItemClick(AdapterView<?> parent, final View view,
//                                    int position, long id)
//            {
//                Ingredient selectedIngredient = (Ingredient) parent.getItemAtPosition(position);
//                selectedIngredient.setIsSelected();
//
//                if (selectedIngredient.getIsSelected()){
//                    _selectedIngredientsList.add(selectedIngredient);
//                }else{
//                    _selectedIngredientsList.remove(selectedIngredient);
//                }
//
//                //ChangeAddIngredientButton();
//            }
//        });

        return rootView;
    }

    private void ChangeAddIngredientButton() {
        //TODO Check if there is at least one ingredient selected
        FloatingActionButton addButton = (FloatingActionButton) getActivity().findViewById(R.id.fab);
        addButton.setImageResource(R.drawable.ic_playlist_add_white_24dp);
    }

    public ArrayList<Ingredient> getSelectedIngredients()
    {
        ArrayList<Ingredient> selectedIngredients = new ArrayList<>();

        for (Ingredient ingredient:_ingredientsList
                ) {
            if (ingredient.getIsSelected()) {
                selectedIngredients.add(ingredient);
            }
        }

        UnSelectAll();

        return selectedIngredients;
    }

    public ArrayList<String> getSelectedIngredients_Names()
    {
        ArrayList<String> selectedIngredients = new ArrayList<>();

        for (Ingredient ingredient:_ingredientsList
                ) {
            if (ingredient.getIsSelected()) {
                selectedIngredients.add(ingredient.getName());
            }
        }

        UnSelectAll();

        return selectedIngredients;
    }

    public ArrayList<Long> getSelectedIngredients_Ids()
    {
        ArrayList<Long> selectedIngredients = new ArrayList<>();

        for (Ingredient ingredient:_ingredientsList
                ) {
            if (ingredient.getIsSelected()) {
                selectedIngredients.add(ingredient.getId());
            }
        }

        //Long[] ids = selectedIngredients.toArray(new Long[selectedIngredients.size()]);

        UnSelectAll();

        return selectedIngredients;
    }

    private void UnSelectAll()
    {
        //_hasSelectedItems = false;

        _ingredientsAdatper._selectedIngredientsList.clear();

        for (Ingredient ingredient : _ingredientsList
             ) {
            if (ingredient.getIsSelected()){
                ingredient.setIsSelected();
            }
        }

        _ingredientsAdatper.notifyDataSetChanged();
        _ingredientsListView.clearChoices();

        //uncheckAllChildrenCascade(_ingredientsListView);
    }

//    private void uncheckAllChildrenCascade(ViewGroup vg) {
//        for (int i = 0; i < vg.getChildCount(); i++) {
//            View v = vg.getChildAt(i);
//            if (v instanceof CheckBox) {
//                ((CheckBox) v).setChecked(false);
//            } else if (v instanceof ViewGroup) {
//                uncheckAllChildrenCascade((ViewGroup) v);
//            }
//        }
//    }

    public int addSelectedIngredientsToShoppingList() {
        //ArrayList<Ingredient> selectedIngredients = getSelectedIngredients();

        if (_ingredientsAdatper._selectedIngredientsList.size() != 0) {

            StroppingDatabase db = new StroppingDatabase(getContext());
            db.open();

            for (Ingredient ingredient : _ingredientsAdatper._selectedIngredientsList
                    ) {
                db.createShoppingListItem(ingredient.getId(), ingredient.getQuantity(), 0);
            }

            db.close();

            UnSelectAll();

            return 0;
        } else {
            Intent intent = new Intent(getContext(), IngredientEditActivity.class);
            getContext().startActivity(intent);
            return (1);
        }
    }
}
