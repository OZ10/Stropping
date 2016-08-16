package com.oz10.stropping;

import android.os.Bundle;
import android.support.annotation.Nullable;
import android.support.v4.app.Fragment;
import android.support.v7.widget.GridLayoutManager;
import android.support.v7.widget.LinearLayoutManager;
import android.support.v7.widget.RecyclerView;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;

import com.adapters.RecipeListAdapter;
import com.adapters.database.StroppingDatabase;
import com.classes.Recipe;

import java.util.ArrayList;

/**
 * Created by Austen on 04/08/2016.
 */
public class RecipesFragment extends Fragment {

    RecipeListAdapter _recipeListAdapter;

    @Nullable
    @Override
    public View onCreateView(LayoutInflater inflater, @Nullable ViewGroup container, @Nullable Bundle savedInstanceState) {
        ViewGroup rootView = (ViewGroup) inflater.inflate(
                R.layout.fragment_recipes, container, false);

        RecyclerView recipes_RecyclerView = (RecyclerView)rootView.findViewById(R.id.recipes_recyclerview);
        recipes_RecyclerView.setLayoutManager(new GridLayoutManager(getActivity(), 2));

//        ArrayList<Recipe> recipeList = new ArrayList<>();
//        recipeList.add(new Recipe("Spag"));
//        recipeList.add(new Recipe("Spicy Sausage Rice"));
//        recipeList.add(new Recipe("Pasta"));

        StroppingDatabase stroppingDatabase = new StroppingDatabase(getContext());
        stroppingDatabase.open();

        ArrayList<Recipe> recipeList = stroppingDatabase.getAllRecipes();

        _recipeListAdapter = new RecipeListAdapter(recipeList);
        recipes_RecyclerView.setAdapter(_recipeListAdapter);
        return rootView;
    }
}