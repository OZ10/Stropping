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
import android.widget.ListView;

import com.classes.Ingredient;

import java.util.ArrayList;

/**
 * Created by Austen on 02/08/2016.
 */
public class IngredientsListFragment extends Fragment {

    ArrayList<Ingredient> _ingredientsList = new ArrayList<>();

    @Override
    public View onCreateView(LayoutInflater inflater, ViewGroup container,
                             Bundle savedInstanceState) {
        ViewGroup rootView = (ViewGroup) inflater.inflate(
                R.layout.fragment_ingredients, container, false);

//        FragmentIngredientsBinding binding = DataBindingUtil.inflate(inflater, R.layout.fragment_ingredients, container, false);
//        IngredientsList ingredientsList = new IngredientsList();
//        binding.setListItems(ingredientsList);

        _ingredientsList.add(new Ingredient("Apple", false));
        _ingredientsList.add(new Ingredient("Pear", false));
        _ingredientsList.add(new Ingredient("Snake", false));

        ArrayAdapter<Ingredient> customAdapter = new ArrayAdapter<Ingredient>(getContext(), android.R.layout.simple_list_item_multiple_choice, _ingredientsList);

        ListView ingredientsListView = (ListView) rootView.findViewById(R.id.ingredientslistView);
        ingredientsListView.setAdapter(customAdapter);

        ingredientsListView.setOnItemClickListener(new AdapterView.OnItemClickListener()
        {
            @Override
            public void onItemClick(AdapterView<?> parent, final View view,
                                    int position, long id)
            {
                Ingredient selectedIngredient = (Ingredient) parent.getItemAtPosition(position);
                selectedIngredient.setIsSelected();

                ChangeAddIngredientButton();
            }
        });

        return rootView;

        //return binding.getRoot();
    }

    private void SetupList()
    {
//        _ingredientsList.add(new Ingredient("Apple", false));
//        _ingredientsList.add(new Ingredient("Pear", false));
//        _ingredientsList.add(new Ingredient("Snake", false));
//
//        ArrayAdapter<Ingredient> customAdapter = new ArrayAdapter<Ingredient>(getContext(), android.R.layout.simple_list_item_multiple_choice, _ingredientsList);
//
//        ListView ingredientsListView = (ListView) getView().findViewById(R.id.ingredientslistView);
//        ingredientsListView.setAdapter(customAdapter);
//
//        ingredientsListView.setOnItemClickListener(new AdapterView.OnItemClickListener()
//        {
//            @Override
//            public void onItemClick(AdapterView<?> parent, final View view,
//                                    int position, long id)
//            {
//                Ingredient selectedIngredient = (Ingredient) parent.getItemAtPosition(position);
//                selectedIngredient.setIsSelected();
//
//                //ChangeAddIngredientButton();
//            }
//        });
    }
//
    private void ChangeAddIngredientButton() {
        //TODO Check if there is at least one ingredient selected
        FloatingActionButton addButton = (FloatingActionButton) getActivity().findViewById(R.id.fab);
        addButton.setImageResource(R.drawable.ic_playlist_add_white_24dp);
    }
//
    public ArrayList<String> getSelectedIngredients()
    {

        ArrayList<String> selectedIngredients = new ArrayList<>();

        for (Ingredient ingredient:_ingredientsList
                ) {
            if (ingredient.getIsSelected()) {
                selectedIngredients.add(ingredient.getName());
            }
        }

        return selectedIngredients;
    }
}
