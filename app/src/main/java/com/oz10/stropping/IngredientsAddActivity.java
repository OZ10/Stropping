package com.oz10.stropping;

import android.content.Intent;
import android.support.v4.app.FragmentManager;
import android.support.v4.app.FragmentTransaction;
import android.support.v7.app.ActionBar;
import android.support.v7.app.AppCompatActivity;
import android.os.Bundle;
import android.view.Menu;
import android.view.MenuInflater;
import android.view.MenuItem;

import java.util.ArrayList;

public class IngredientsAddActivity extends AppCompatActivity {

    IngredientsListFragment _ingredientsListFragment;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_ingredients_add);

        SetupActionbar();

        GetIngredientsFragment();
    }

    private void GetIngredientsFragment()
    {
        FragmentManager fragmentManager = getSupportFragmentManager();
        FragmentTransaction fragmentTransaction = fragmentManager.beginTransaction();

        _ingredientsListFragment = new IngredientsListFragment();
        fragmentTransaction.add(R.id.ingredients_add_listview, _ingredientsListFragment);
        fragmentTransaction.commit();
    }

    private void SetupActionbar()
    {
        ActionBar actionBar = getSupportActionBar();
        actionBar.setDisplayHomeAsUpEnabled(true);
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        //return super.onCreateOptionsMenu(menu);
        MenuInflater menuInflater = getMenuInflater();
        menuInflater.inflate(R.menu.menu_ok_only, menu);
        return true;
    }

    public boolean onOptionsItemSelected(MenuItem item){
        //TODO Refactor
        if (item.getItemId() == android.R.id.home){
            finish();
            return true;
        }
        else if (item.getItemId() == R.id.action_menu_ok){
            Intent returnIntent = new Intent();
            ArrayList<Long> ingredientIds = _ingredientsListFragment.getSelectedIngredients_Ids();

            returnIntent.putExtra("IngredientIds", ingredientIds);
            setResult(RESULT_OK, returnIntent);
            finish();
        }

        return true;
    }
}
